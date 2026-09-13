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

const CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string || '').trim()
const UPLOAD_PRESET = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string || '').trim().replace(/\s+/g, '_')

async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= 1_500_000) {
    return file
  }

  try {
    let source: CanvasImageSource
    let sourceWidth: number
    let sourceHeight: number
    let cleanup = () => {}

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      source = bitmap
      sourceWidth = bitmap.width
      sourceHeight = bitmap.height
      cleanup = () => bitmap.close()
    } else {
      const objectUrl = URL.createObjectURL(file)
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error('The selected image could not be read by this browser.'))
        element.src = objectUrl
      })
      source = image
      sourceWidth = image.naturalWidth
      sourceHeight = image.naturalHeight
      cleanup = () => URL.revokeObjectURL(objectUrl)
    }

    const maxDimension = 2000
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      cleanup()
      return file
    }

    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    cleanup()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }) : file
  } catch {
    // Image resizing is an optimization; upload the original if this browser cannot process it.
    return file
  }
}

export async function uploadImage(file: File): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Missing VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_UPLOAD_PRESET in .env')
  }

  const preparedFile = await prepareImage(file)
  const formData = new FormData()
  formData.append('file', preparedFile)
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
