import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../shared/ui/icon.component';

/** Two-panel layout for sign in / register: an animated brand panel on large screens, just the form on phones. */
@Component({
  selector: 'app-auth-layout',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth">
      <section class="brand" aria-hidden="true">
        <i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>
        <div class="logo"><span class="mark"><app-icon name="trending-up" [size]="22" /></span> Expense Tracker</div>
        <div class="hero">
          <h2>Know where every rupee goes.</h2>
          <p>Import your statements, see spending patterns nobody else shows you, and stay ahead of your budget.</p>
          <ul>
            <li><app-icon name="zap" [size]="16" /> One-click import with automatic duplicate protection</li>
            <li><app-icon name="sparkles" [size]="16" /> Financial health score, money flow and payday insights</li>
            <li><app-icon name="shield" [size]="16" /> Your data stays private to your account</li>
          </ul>
        </div>
        <div class="stats">
          <div><strong>15+</strong><span>analytics views</span></div>
          <div><strong>100%</strong><span>mobile ready</span></div>
          <div><strong>0</strong><span>duplicate imports</span></div>
        </div>
      </section>

      <main class="panel">
        <div class="mobile-logo"><span class="mark"><app-icon name="trending-up" [size]="20" /></span> Expense Tracker</div>
        <div class="card glow-border form-card">
          <div class="head">
            <h1>{{ title() }}</h1>
            <p>{{ subtitle() }}</p>
          </div>
          <ng-content />
        </div>
        <div class="foot"><ng-content select="[foot]" /></div>
      </main>
    </div>
  `,
  styles: [`
    .auth { min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
    .brand { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; padding: clamp(28px, 4vw, 56px);
      background: linear-gradient(160deg, #1a1650 0%, #2b1670 45%, #5b1d6e 100%); color: #fff; }
    .orb { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; animation: float 9s ease-in-out infinite; }
    .o1 { width: 340px; height: 340px; background: #7c6cff; top: -80px; right: -60px; }
    .o2 { width: 300px; height: 300px; background: #f472b6; bottom: -90px; left: -60px; animation-delay: -3s; }
    .o3 { width: 220px; height: 220px; background: #22d3ee; top: 45%; left: 40%; opacity: .3; animation-delay: -6s; }
    .logo, .mobile-logo { position: relative; display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 1.15rem; letter-spacing: -.02em; }
    .mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; color: #fff; background: var(--grad); box-shadow: 0 10px 26px -8px #7c6cff; }
    .hero { position: relative; max-width: 520px; animation: fadeUp .8s .1s both; }
    h2 { font-size: clamp(2rem, 3.4vw, 3rem); line-height: 1.08; font-weight: 850; letter-spacing: -.035em; margin-bottom: 14px; }
    .hero p { color: rgba(255, 255, 255, .78); font-size: 1.05rem; line-height: 1.6; margin-bottom: 22px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    li { display: flex; align-items: center; gap: 10px; color: rgba(255, 255, 255, .9); font-weight: 500; }
    li app-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; background: rgba(255, 255, 255, .14); }
    .stats { position: relative; display: flex; gap: 28px; flex-wrap: wrap; }
    .stats div { display: flex; flex-direction: column; }
    .stats strong { font-size: 1.7rem; font-weight: 800; letter-spacing: -.03em; }
    .stats span { color: rgba(255, 255, 255, .65); font-size: .82rem; }
    .panel { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 18px; padding: 28px clamp(16px, 4vw, 56px); }
    .mobile-logo { display: none; color: var(--text); }
    .form-card { width: min(440px, 100%); padding: clamp(22px, 4vw, 34px); animation: fadeUp .6s both; }
    .head { margin-bottom: 22px; }
    h1 { font-size: 1.65rem; font-weight: 800; }
    .head p { color: var(--muted); margin-top: 6px; }
    .foot { color: var(--muted); font-size: .92rem; text-align: center; }
    @media (max-width: 1023.98px) {
      .auth { grid-template-columns: minmax(0, 1fr); }
      .brand { display: none; }
      .mobile-logo { display: flex; }
      .panel { min-height: 100dvh; }
    }
  `],
})
export class AuthLayoutComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
