export interface PhoneVerificationSnapshot {
  state: 'sent' | 'timeout' | 'verified' | 'error';
  verificationId: string | null;
  code: string | null;
  error?: unknown;
}

/** Show the code field on `sent`; Android can also verify instantly without sending an SMS. */
export function requestNativePhoneCode(options: {
  subscribe: (receive: (snapshot: PhoneVerificationSnapshot) => void) => void;
  ensureCurrent: () => void;
  onSent: (id: string) => void;
  onVerified: (snapshot: PhoneVerificationSnapshot) => Promise<void>;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    let verifying = false;
    options.subscribe((snapshot) => {
      try {
        options.ensureCurrent();
        if (snapshot.state === 'error') {
          reject(snapshot.error ?? new Error('Phone verification failed'));
        } else if (snapshot.state === 'verified') {
          if (verifying) return;
          verifying = true;
          void options.onVerified(snapshot).then(() => resolve(''), reject);
        } else if (snapshot.verificationId) {
          options.onSent(snapshot.verificationId);
          resolve(snapshot.verificationId);
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}
