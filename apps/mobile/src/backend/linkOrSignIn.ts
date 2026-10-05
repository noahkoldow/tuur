/** Keep new identities on the guest account; an existing identity signs into its own account, never merges it. */
export async function linkOrSignIn<Credential, Result>(options: {
  anonymous: boolean;
  credential: Credential;
  link: (credential: Credential) => Promise<Result>;
  signIn: (credential: Credential) => Promise<Result>;
  /** Apple credentials are single-use: obtain a fresh token after the failed link. */
  refreshCredential?: () => Promise<Credential>;
}): Promise<Result> {
  if (!options.anonymous) return options.signIn(options.credential);
  try {
    return await options.link(options.credential);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== 'auth/credential-already-in-use') throw error;
    const credential = options.refreshCredential ? await options.refreshCredential() : options.credential;
    return options.signIn(credential);
  }
}
