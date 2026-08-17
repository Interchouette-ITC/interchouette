import { Injectable, signal } from '@angular/core';

export const CUSTOMER_SESSION_KEY = 'ic.customer';

export interface CustomerProfile {
  name: string;
  email: string;
  picture: string;
  sub: string;
}

function readProfile(): CustomerProfile | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CustomerProfile>;
    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.picture !== 'string' ||
      typeof parsed.sub !== 'string'
    ) {
      return null;
    }
    return {
      name: parsed.name,
      email: parsed.email,
      picture: parsed.picture,
      sub: parsed.sub,
    };
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class CustomerSession {
  readonly profile = signal<CustomerProfile | null>(readProfile());

  firstName(): string {
    const name = this.profile()?.name.trim() ?? '';
    return name.split(/\s+/)[0] || name;
  }

  signIn(profile: CustomerProfile): void {
    this.profile.set(profile);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(profile));
    }
  }

  signOut(): void {
    this.profile.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
    }
  }
}
