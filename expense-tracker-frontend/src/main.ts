import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error('Application failed to start', error);
  document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Something went wrong while starting the app. Please refresh the page.</p>';
});
