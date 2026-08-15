// Uploads directly from the browser to Cloudinary using an *unsigned*
// upload preset. This deliberately avoids needing a server-side signing
// step (an edge function + API secret) — the cloud name and an unsigned
// preset name are meant to be public, so this is safe to call straight
// from the client with only two env vars.
//
// Set these in Cloudinary's dashboard first:
//   Settings -> Upload -> Upload presets -> Add upload preset
//   - Signing mode: Unsigned
//   - Folder: e.g. "students" (optional, keeps things tidy)
//
// Then set in your .env (frontend only, nothing in Supabase secrets):
//   VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
//   VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset-name

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string

export async function uploadImage(file: File): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Missing VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_UPLOAD_PRESET in .env')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cloudinary upload failed: ${text}`)
  }

  const data = await res.json()
  return data.secure_url as string
}

// Kept as a thin wrapper so existing imports (StudentRegistrationForm,
// EditStudentForm) don't need to change.
export async function uploadStudentPhoto(file: File): Promise<string> {
  return uploadImage(file)
}
