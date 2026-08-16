import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';

import { ChatRole, ChatService } from '../../core/chat.service';

const NUDGE_EVERY_MS = 2 * 60 * 1000;
const NUDGE_BOUNCE_MS = 1100;

const NUDGE_HOOKS = [
  "Don't be a stranger",
  'The owl noticed you',
  'Psst… over here',
  'Rust never sleeps',
  'Say hi before the coffee cools',
  'Your cursor looks lonely',
  'Plot twist: you can talk to us',
  'This bubble has feelings',
  'Free high-fives available',
  'We brought snacks (metaphorically)',
  'No ticket required',
  'The FAQ is jealous of chat',
  'Hot take welcome',
  'Silence is overrated',
  'One click, zero awkwardness',
  'Greg / ITCy miss you already',
  'Scrolling is optional; chatting is fun',
  'Permission to be curious granted',
  'Even Wasm needs a hello',
  'Come say boop',
] as const;

@Component({
  selector: 'app-chat-widget',
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class ChatWidget implements OnDestroy {
  protected readonly chat = inject(ChatService);
  protected readonly mounted = signal(false);
  /** Soft invite bubble next to the chat button. */
  protected readonly nudgeHint = signal(false);
  /** One-shot bounce on the chat button. */
  protected readonly nudgeBounce = signal(false);
  /** Stable copy for the current nudge pulse. */
  protected readonly nudgeCopy = signal('');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected draft = '';
  protected emailDraft = '';
  protected showEmail = false;

  private nudgeTimer: ReturnType<typeof setInterval> | null = null;
  private bounceTimer: ReturnType<typeof setTimeout> | null = null;
  private bubbleDismissed = false;

  constructor() {
    afterNextRender(() => {
      this.mounted.set(true);
      void this.chat.warm().then(() => this.tryStartNudge());
    });
    effect(() => {
      this.chat.messages();
      this.chat.typing();
      this.chat.open();
      queueMicrotask(() => this.scrollToBottom());
    });
    effect(() => {
      if (this.chat.open() || this.chat.hasOpenedThisSession()) {
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
    this.chat.closePanel();
  }

  protected onRetry(): void {
    void this.chat.connect();
  }

  protected onDraftInput(event: Event): void {
    this.draft = (event.target as HTMLInputElement).value;
  }

  protected onEmailInput(event: Event): void {
    this.emailDraft = (event.target as HTMLInputElement).value;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const text = this.draft;
    this.draft = '';
    this.chat.send(text);
    queueMicrotask(() => this.scrollToBottom());
  }

  protected onChip(text: string): void {
    if (text === 'Leave my email') {
      this.showEmail = true;
      return;
    }
    if (!this.chat.wsReady()) {
      return;
    }
    this.chat.send(text);
    queueMicrotask(() => this.scrollToBottom());
  }

  protected onEmailSubmit(event: Event): void {
    event.preventDefault();
    this.chat.sendEmail(this.emailDraft);
    this.emailDraft = '';
    this.showEmail = false;
  }

  protected toggleEmail(): void {
    this.showEmail = !this.showEmail;
  }

  protected quickChips(): string[] {
    if (this.chat.hero() === 'greg') {
      return ['Hi Greg', 'Rust / Wasm project?', 'Availability this month?'];
    }
    return ['What is Interchouette?', 'Who is Gregory Roussac?', 'Leave my email'];
  }

  protected title(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Chat with Greg';
      case 'itcy':
        return 'Chat with ITCy';
      default:
        return 'Connecting…';
    }
  }

  private buildNudgeCopy(): string {
    const hook = NUDGE_HOOKS[Math.floor(Math.random() * NUDGE_HOOKS.length)] ?? NUDGE_HOOKS[0];
    const who =
      this.chat.hero() === 'greg'
        ? 'Chat with Greg!'
        : this.chat.hero() === 'itcy'
          ? 'Chat with ITCy!'
          : 'Chat with Greg / ITCy!';
    return `${hook}! ${who}`;
  }

  protected fabAriaLabel(): string {
    if (this.chat.open()) {
      return 'Close chat';
    }
    switch (this.chat.hero()) {
      case 'greg':
        return 'Open chat with Greg';
      case 'itcy':
        return 'Open chat with ITCy';
      default:
        return 'Open chat with Greg or ITCy';
    }
  }

  protected subtitle(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Usually replies in a few minutes';
      case 'itcy':
        return 'Greg is away · ITCy can help now';
      default:
        return 'Opening a private line…';
    }
  }

  protected emptyKicker(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Live with Gregory';
      case 'itcy':
        return 'AI on duty';
      default:
        return 'Establishing link';
    }
  }

  protected emptyTitle(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Greg is online';
      case 'itcy':
        return 'Ask ITCy anything';
      default:
        return 'One moment';
    }
  }

  protected emptyBody(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Your message reaches Greg live. Ask about Rust, Wasm, or a collaboration.';
      case 'itcy':
        return "Greg's AI, powered by Interchouette public knowledge. Leave a note anytime.";
      default:
        return 'Opening a private Interchouette line…';
    }
  }

  protected whoLabel(role: ChatRole): string {
    switch (role) {
      case 'greg':
        return 'Gregory Roussac';
      case 'itcy':
        return 'ITCy';
      case 'system':
        return 'System';
      default:
        return 'You';
    }
  }

  /** Small face for the floating chat button. */
  protected fabFaceSrc(): string {
    return this.chat.hero() === 'itcy' ? '/img/itcy-mascot-1x.webp' : '/img/avatar-1x.webp';
  }

  /** Header / welcome mark in the open panel. */
  protected panelFaceSrc(): string {
    return this.chat.hero() === 'itcy' ? '/img/itcy-mascot-2x.webp' : '/img/avatar-2x.webp';
  }

  /** Message row avatar for Greg or ITCy. */
  protected rowFaceSrc(role: ChatRole): string {
    return role === 'itcy' ? '/img/itcy-mascot-1x.webp' : '/img/avatar-1x.webp';
  }

  private tryStartNudge(): void {
    if (this.bubbleDismissed || this.chat.hasOpenedThisSession() || this.chat.open()) {
      return;
    }
    if (!this.chat.ready()) {
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
    if (this.nudgeTimer || this.bubbleDismissed || this.chat.hasOpenedThisSession()) {
      return;
    }
    this.nudgeTimer = setInterval(() => this.pulseBounce(), NUDGE_EVERY_MS);
  }

  private pulseBounce(): void {
    if (this.chat.open() || this.chat.hasOpenedThisSession() || !this.chat.ready()) {
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
  }

  private scrollToBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
