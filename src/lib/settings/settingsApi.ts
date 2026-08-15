import { supabase } from '../supabaseClient'

// Supabase's client SDK doesn't require the current password to call
// updateUser() while already signed in — but asking for it and
// verifying via a fresh sign-in first is a meaningful extra check
// against someone at an unlocked, unattended computer.
export async function verifyCurrentPassword(email: string, currentPassword: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  return !error
}

export async function updateOwnPassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return { error: error ? error.message : null }
}

export async function updateOwnAvatar(profileId: string, avatarUrl: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profileId)
  if (error) throw error
}
