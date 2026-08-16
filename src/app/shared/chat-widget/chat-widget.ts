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

  protected onEmailSubmit(event: Event): void {
    event.preventDefault();
    this.chat.sendEmail(this.emailDraft);
    this.emailDraft = '';
    this.showEmail = false;
  }

  protected toggleEmail(): void {
    this.showEmail = !this.showEmail;
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
        return 'Greg is online';
      case 'itcy':
        return 'Greg is away · ITCy can help';
      default:
        return 'Warming up the line…';
    }
  }

  protected emptyTitle(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Say hello';
      case 'itcy':
        return 'Ask about Interchouette';
      default:
        return 'One moment';
    }
  }

  protected emptyBody(): string {
    switch (this.chat.hero()) {
      case 'greg':
        return 'Your message goes to Greg on Slack. He can reply here live.';
      case 'itcy':
        return "I am ITCy, Greg's AI assistant. Ask about projects, Rust, or how to reach him.";
      default:
        return 'Connecting to the chat line…';
    }
  }

  protected whoLabel(role: ChatRole): string {
    switch (role) {
      case 'greg':
        return 'Greg';
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
