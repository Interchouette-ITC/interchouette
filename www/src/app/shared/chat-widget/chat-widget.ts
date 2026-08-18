import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';

import { ChatRole, ChatService } from '../../core/chat.service';
import { BOOKING_SCHEDULE_URL, SLACK_JOIN_URL } from '../../core/chat.constants';
import { ChatLinkPart, splitHttpLinks } from '../../core/chat.links';
import { fillCopy } from '../../core/i18n/catalog';
import { LocaleService } from '../../core/locale.service';
import { RouterLink } from '@angular/router';

const NUDGE_EVERY_MS = 60 * 1000;
const NUDGE_BOUNCE_MS = 1100;
const FAB_ENTER_MS = 1100;

@Component({
  selector: 'app-chat-widget',
  imports: [RouterLink],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class ChatWidget implements OnDestroy {
  protected readonly chat = inject(ChatService);
  protected readonly copy = inject(LocaleService).copy;
  private readonly injector = inject(Injector);
  protected readonly mounted = signal(false);
  /** Soft invite bubble next to the chat button. */
  protected readonly nudgeHint = signal(false);
  /** One-shot bounce on the chat button. */
  protected readonly nudgeBounce = signal(false);
  /** Entrance animation only; cleared so later nudges do not re-trigger it. */
  protected readonly fabEnter = signal(true);
  /** Stable copy for the current nudge pulse. */
  protected readonly nudgeCopy = signal('');
  /** Near-fullscreen chat panel. */
  protected readonly expanded = signal(false);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly emailField = viewChild<ElementRef<HTMLInputElement>>('emailField');
  private readonly messageField = viewChild<ElementRef<HTMLInputElement>>('messageField');

  protected readonly canSend = signal(false);
  /** Brief “Copied” state for the ticket button. */
  protected readonly ticketCopied = signal(false);
  /** Always a string: never leave compose bindings as undefined. */
  protected draft = '';
  protected showEmail = false;
  protected readonly slackJoinUrl = SLACK_JOIN_URL;
  protected readonly bookingScheduleUrl = BOOKING_SCHEDULE_URL;
  /** Google Calendar booking iframe inside the chat panel. */
  protected readonly bookingOpen = signal(false);

  private nudgeTimer: ReturnType<typeof setInterval> | null = null;
  private bounceTimer: ReturnType<typeof setTimeout> | null = null;
  private enterTimer: ReturnType<typeof setTimeout> | null = null;
  private ticketCopyTimer: ReturnType<typeof setTimeout> | null = null;
  private bubbleDismissed = false;

  constructor() {
    afterNextRender(() => {
      this.mounted.set(true);
      this.enterTimer = setTimeout(() => this.fabEnter.set(false), FAB_ENTER_MS);
      void this.chat.warm().then(() => this.tryStartNudge());
    });
    effect(() => {
      if (!this.chat.open()) {
        this.expanded.set(false);
      }
    });
    effect(() => {
      this.chat.messages();
      this.chat.typing();
      this.chat.open();
      queueMicrotask(() => this.scrollToBottom());
    });
    effect(() => {
      if (this.chat.open()) {
        this.dismissBubbleAndBounce();
        return;
      }
      if (this.mounted() && this.chat.ready()) {
        this.tryStartNudge();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearBounceTimers();
  }

  protected onFab(): void {
    this.dismissBubbleAndBounce();
    this.chat.toggle();
  }

  protected onNudgeClick(): void {
    this.dismissBubbleAndBounce();
    void this.chat.openPanel();
  }

  protected onClose(): void {
    this.expanded.set(false);
    this.bookingOpen.set(false);
    this.chat.closePanel();
  }

  protected onToggleExpand(): void {
    this.expanded.update((v) => !v);
  }

  protected async onCopyTicket(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const code = this.ticketDisplay();
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    this.ticketCopied.set(true);
    if (this.ticketCopyTimer) {
      clearTimeout(this.ticketCopyTimer);
    }
    this.ticketCopyTimer = setTimeout(() => this.ticketCopied.set(false), 1600);
  }

  protected onRetry(): void {
    void this.chat.connect({ silent: false });
  }

  protected onForgetChat(): void {
    this.showEmail = false;
    this.bookingOpen.set(false);
    this.canSend.set(false);
    this.draft = '';
    void this.chat.forgetChat();
  }

  protected onDraftInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.canSend.set(value.trim().length > 0);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const input = this.messageField()?.nativeElement;
    if (!input) {
      return;
    }
    const text = String(input.value ?? '').trim();
    input.value = '';
    this.draft = '';
    this.canSend.set(false);
    if (!text) {
      return;
    }
    this.chat.send(text);
    queueMicrotask(() => this.scrollToBottom());
  }

  protected onEmailSubmit(event: Event): void {
    event.preventDefault();
    this.saveEmailField();
  }

  protected onEmailKeydown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.saveEmailField();
  }

  private saveEmailField(): void {
    const input = this.emailField()?.nativeElement;
    if (!input) {
      return;
    }
    if (!input.reportValidity()) {
      return;
    }
    const email = String(input.value ?? '').trim();
    if (!email) {
      return;
    }
    this.chat.sendEmail(email);
  }

  protected toggleEmail(): void {
    this.showEmail = !this.showEmail;
    if (this.showEmail) {
      this.scheduleEmailSeed();
    }
  }

  protected onChip(text: string): void {
    if (text === this.copy.chat.chipLeaveEmail) {
      this.showEmail = true;
      this.scheduleEmailSeed();
      return;
    }
    if (!this.chat.wsReady()) {
      return;
    }
    this.chat.send(text);
    if (text === this.copy.chat.chipBook && this.bookingEnabled()) {
      this.bookingOpen.set(true);
    }
    queueMicrotask(() => this.scrollToBottom());
  }

  protected bookingEnabled(): boolean {
    return this.bookingScheduleUrl.trim().length > 0;
  }

  protected openBooking(): void {
    if (this.bookingEnabled()) {
      this.bookingOpen.set(true);
    }
  }

  protected closeBooking(): void {
    this.bookingOpen.set(false);
  }

  protected messageOffersBooking(text: string): boolean {
    if (!this.bookingEnabled()) {
      return false;
    }
    const url = this.bookingScheduleUrl.trim();
    if (url && text.includes(url)) {
      return true;
    }
    return /calendar\.(app\.)?google|calendar\.google\.com\/calendar\/appointments/i.test(text);
  }

  private scheduleEmailSeed(): void {
    afterNextRender(() => this.seedEmailField(), { injector: this.injector });
  }

  private seedEmailField(): void {
    const input = this.emailField()?.nativeElement;
    if (!input) {
      return;
    }
    const saved = this.chat.readSavedEmail();
    if (saved) {
      input.value = saved;
    }
  }

  protected quickChips(): string[] {
    const c = this.copy.chat;
    const book = c.chipBook;
    if (this.chat.hero() === 'greg') {
      return [c.chipHiGreg, c.chipRust, book];
    }
    return [c.chipWhat, c.chipWho, book];
  }

  protected title(): string {
    const c = this.copy.chat;
    switch (this.chat.hero()) {
      case 'greg':
        return c.titleGreg;
      case 'itcy':
        return c.titleItcy;
      default:
        return c.titleConnecting;
    }
  }

  private buildNudgeCopy(): string {
    const c = this.copy.chat;
    if (this.chat.priorConversation()) {
      const hooks = c.resumeNudgeHooks;
      const hook = hooks[Math.floor(Math.random() * hooks.length)] ?? hooks[0];
      return `${hook}. ${c.resumeOpen}`;
    }
    const hooks = c.nudgeHooks;
    const hook = hooks[Math.floor(Math.random() * hooks.length)] ?? hooks[0];
    const who =
      this.chat.hero() === 'greg'
        ? c.chatGregBang
        : this.chat.hero() === 'itcy'
          ? c.chatItcyBang
          : c.chatBothBang;
    return `${hook}! ${who}`;
  }

  protected fabAriaLabel(): string {
    const c = this.copy.chat;
    switch (this.chat.hero()) {
      case 'greg':
        return c.fabGreg;
      case 'itcy':
        return c.fabItcy;
      default:
        return c.fabBoth;
    }
  }

  protected ticketDisplay(): string {
    return this.chat.shortCode().trim();
  }

  protected ticketCopyAria(): string {
    const c = this.copy.chat;
    return this.ticketCopied()
      ? c.ticketCopiedAria
      : fillCopy(c.copyTicketAria, { ticket: this.ticketDisplay() });
  }

  protected ticketCopyTitle(): string {
    return this.ticketCopied() ? this.copy.chat.copied : this.copy.chat.copyTicket;
  }

  protected expandAria(): string {
    return this.expanded() ? this.copy.chat.exitFull : this.copy.chat.expand;
  }

  protected expandTitle(): string {
    return this.expanded() ? this.copy.chat.exitFullTitle : this.copy.chat.expand;
  }

  protected subtitle(): string {
    const c = this.copy.chat;
    switch (this.chat.hero()) {
      case 'greg':
        return c.subGreg;
      case 'itcy':
        return c.subItcy;
      default:
        return c.subConnecting;
    }
  }

  protected emptyKicker(): string {
    const c = this.copy.chat;
    switch (this.chat.hero()) {
      case 'greg':
        return c.kickerGreg;
      case 'itcy':
        return c.kickerItcy;
      default:
        return c.kickerConnecting;
    }
  }

  protected emptyTitle(): string {
    const c = this.copy.chat;
    switch (this.chat.hero()) {
      case 'greg':
      case 'itcy':
        return c.emptyTitle;
      default:
        return c.emptyTitleWait;
    }
  }

  protected emptyHint(): string {
    const c = this.copy.chat;
    switch (this.chat.hero()) {
      case 'greg':
        return c.emptyHintGreg;
      case 'itcy':
        return c.emptyHintItcy;
      default:
        return c.emptyHintWait;
    }
  }

  protected introRole(): ChatRole {
    return 'itcy';
  }

  protected introLead(): string {
    return this.chat.hero() === 'greg'
      ? this.copy.chat.introLeadGreg
      : this.copy.chat.introLeadItcy;
  }

  protected introCan(): string {
    return this.chat.hero() === 'greg' ? this.copy.chat.introCanGreg : this.copy.chat.introCanItcy;
  }

  protected introSlackBefore(): string {
    return this.chat.hero() === 'greg'
      ? this.copy.chat.slackBeforeGreg
      : this.copy.chat.slackBeforeItcy;
  }

  protected introSlackLinkLabel(): string {
    return this.chat.hero() === 'greg'
      ? this.copy.chat.slackLinkGreg
      : this.copy.chat.slackLinkItcy;
  }

  protected introSlackAfter(): string {
    return this.copy.chat.slackAfter;
  }

  protected agentMiniSrc(role: ChatRole): string {
    return role === 'greg' ? '/img/3099551.jpeg' : '/img/itcy-mascot-1x.webp';
  }

  protected linkParts(text: string): ChatLinkPart[] {
    return splitHttpLinks(text);
  }

  protected whoLabel(role: ChatRole): string {
    const c = this.copy.chat;
    switch (role) {
      case 'greg':
        return c.whoGreg;
      case 'itcy':
        return c.whoItcy;
      case 'system':
        return c.whoSystem;
      default:
        return c.whoYou;
    }
  }

  protected typingWho(): string {
    return this.chat.hero() === 'greg' ? this.copy.chat.whoTypingGreg : this.copy.chat.whoItcy;
  }

  protected typingAria(): string {
    return this.chat.hero() === 'greg' ? this.copy.chat.typingGreg : this.copy.chat.typingItcy;
  }

  private tryStartNudge(): void {
    if (this.bubbleDismissed || this.chat.open()) {
      return;
    }
    if (!this.chat.ready()) {
      return;
    }
    // Prior transcript: invite back even after reload (sessionStorage open flag).
    if (this.chat.priorConversation()) {
      this.revealBubble();
      this.startBounceLoop();
      return;
    }
    if (this.chat.hasOpenedThisSession()) {
      return;
    }
    this.revealBubble();
    this.startBounceLoop();
  }

  private revealBubble(): void {
    if (this.bubbleDismissed || this.nudgeHint()) {
      return;
    }
    this.nudgeCopy.set(this.buildNudgeCopy());
    this.nudgeHint.set(true);
  }

  private startBounceLoop(): void {
    if (this.nudgeTimer || this.bubbleDismissed) {
      return;
    }
    if (!this.chat.priorConversation() && this.chat.hasOpenedThisSession()) {
      return;
    }
    this.nudgeTimer = setInterval(() => this.pulseBounce(), NUDGE_EVERY_MS);
  }

  private pulseBounce(): void {
    if (this.chat.open() || !this.chat.ready()) {
      return;
    }
    if (!this.chat.priorConversation() && this.chat.hasOpenedThisSession()) {
      return;
    }
    if (this.nudgeHint()) {
      this.nudgeCopy.set(this.buildNudgeCopy());
    }
    // Drop the class for a frame so the dock bounce animation can restart.
    this.nudgeBounce.set(false);
    if (this.bounceTimer) {
      clearTimeout(this.bounceTimer);
    }
    requestAnimationFrame(() => {
      this.nudgeBounce.set(true);
      this.bounceTimer = setTimeout(() => this.nudgeBounce.set(false), NUDGE_BOUNCE_MS);
    });
  }

  /** Hide invite bubble forever this session; stop bounce when chat was opened. */
  private dismissBubbleAndBounce(): void {
    this.bubbleDismissed = true;
    this.nudgeHint.set(false);
    this.nudgeBounce.set(false);
    this.clearBounceTimers();
  }

  private clearBounceTimers(): void {
    if (this.nudgeTimer) {
      clearInterval(this.nudgeTimer);
      this.nudgeTimer = null;
    }
    if (this.bounceTimer) {
      clearTimeout(this.bounceTimer);
      this.bounceTimer = null;
    }
    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
      this.enterTimer = null;
    }
    if (this.ticketCopyTimer) {
      clearTimeout(this.ticketCopyTimer);
      this.ticketCopyTimer = null;
    }
  }

  private scrollToBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
