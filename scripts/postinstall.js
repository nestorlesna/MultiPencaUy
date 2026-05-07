// Android-only patch — not needed for web/Vercel builds
import { execSync } from 'child_process';

if (process.env.VERCEL) {
  console.log('Skipping patch-package on Vercel (Android patch not needed for web build)');
  process.exit(0);
}

execSync('patch-package', { stdio: 'inherit', shell: true });
