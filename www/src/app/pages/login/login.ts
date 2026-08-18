import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/** Legacy `/login` URL: send visitors to home (Google button lives in the header). */
@Component({
  selector: 'app-login-page',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl('/');
  }
}
