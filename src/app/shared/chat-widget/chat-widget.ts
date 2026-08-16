import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { ChatRole, ChatService } from '../../core/chat.service';

@Component({
  selector: 'app-chat-widget',
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class ChatWidget {
  protected readonly chat = inject(ChatService);
  protected readonly mounted = signal(false);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected draft = '';
  protected emailDraft = '';
  protected showEmail = false;

  constructor() {
    afterNextRender(() => this.mounted.set(true));
    effect(() => {
      this.chat.messages();
      this.chat.typing();
      this.chat.open();
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  protected onFab(): void {
    this.chat.toggle();
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

  private scrollToBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
