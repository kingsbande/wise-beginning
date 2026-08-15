import { jsPDF } from 'jspdf'

// Cloudinary URLs are cross-origin, so the browser needs the image
// fetched and converted to a data URL before jsPDF can embed it —
// it can't just take a remote URL directly.
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function drawHeader(
  doc: jsPDF,
  params: { schoolName: string; logoUrl: string | null; subtitle: string },
): Promise<number> {
  let textX = 20

  if (params.logoUrl) {
    const dataUrl = await loadImageAsDataUrl(params.logoUrl)
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, 'PNG', 20, 10, 20, 20)
        textX = 46
      } catch {
        // Malformed image data — fall back to text-only header rather
        // than failing the whole PDF.
      }
    }
  }

  doc.setFontSize(16)
  doc.text(params.schoolName, textX, 18)
  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text(params.subtitle, textX, 25)
  doc.setTextColor(0)

  return 40 // y position to continue from
}

function drawStudentInfo(
  doc: jsPDF,
  y: number,
  params: {
    studentName: string
    admissionNumber: string
    className: string
    termName: string
    academicYear: string
  },
): number {
  doc.setFontSize(10)
  doc.text(`Student: ${params.studentName}`, 20, y)
  doc.text(`Admission No: ${params.admissionNumber}`, 120, y)
  y += 6
  doc.text(`Class: ${params.className}`, 20, y)
  doc.text(`Term: ${params.termName} (${params.academicYear})`, 120, y)
  return y + 12
}

export async function generateRegistrationConfirmationPdf(params: {
  schoolName: string
  logoUrl: string | null
  studentName: string
  admissionNumber: string
  registrationDate: string
  termsAndConditions: string | null
}) {
  const doc = new jsPDF()

  let y = await drawHeader(doc, {
    schoolName: params.schoolName,
    logoUrl: params.logoUrl,
    subtitle: 'Registration Confirmation',
  })

  y += 10
  doc.setFontSize(12)
  const message = `Thank you for joining ${params.schoolName}, ${params.studentName} has been registered successfully.`
  const wrappedMessage = doc.splitTextToSize(message, 170)
  doc.text(wrappedMessage, 20, y)
  y += wrappedMessage.length * 7 + 10

  doc.setFontSize(10)
  doc.text(`Admission Number: ${params.admissionNumber}`, 20, y)
  y += 8
  doc.text(`Date: ${params.registrationDate}`, 20, y)
  y += 14

  if (params.termsAndConditions && params.termsAndConditions.trim() !== '') {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Terms & Conditions', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const wrappedTerms = doc.splitTextToSize(params.termsAndConditions, 170)
    doc.text(wrappedTerms, 20, y)
    y += wrappedTerms.length * 5
  }

  doc.save(`${params.studentName.replace(/\s+/g, '_')}_registration_confirmation.pdf`)
}

export interface GradeReportRow {
  subject: string
  midterm: number | null
  endOfTerm: number | null
  letter: string | null
}

export async function generateGradeReportPdf(params: {
  schoolName: string
  logoUrl: string | null
  studentName: string
  admissionNumber: string
  className: string
  termName: string
  academicYear: string
  rows: GradeReportRow[]
}) {
  const doc = new jsPDF()

  let y = await drawHeader(doc, {
    schoolName: params.schoolName,
    logoUrl: params.logoUrl,
    subtitle: 'Grade Report',
  })

  y = drawStudentInfo(doc, y, params)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Subject', 20, y)
  doc.text('Midterm', 95, y)
  doc.text('End of Term', 125, y)
  doc.text('Grade', 170, y)
  doc.setFont('helvetica', 'normal')
  y += 3
  doc.line(20, y, 190, y)
  y += 7

  for (const row of params.rows) {
    doc.text(row.subject, 20, y)
    doc.text(row.midterm !== null ? String(row.midterm) : '-', 95, y)
    doc.text(row.endOfTerm !== null ? String(row.endOfTerm) : '-', 125, y)
    doc.text(row.letter ?? '-', 170, y)
    y += 8
    if (y > 270) {
      doc.addPage()
      y = 20
    }
  }

  doc.save(
    `${params.studentName.replace(/\s+/g, '_')}_${params.termName.replace(/\s+/g, '_')}_grade_report.pdf`,
  )
}

export interface ProgressReportFieldValue {
  label: string
  value: string
}

export async function generateProgressReportPdf(params: {
  schoolName: string
  logoUrl: string | null
  studentName: string
  admissionNumber: string
  className: string
  termName: string
  academicYear: string
  fields: ProgressReportFieldValue[]
}) {
  const doc = new jsPDF()

  let y = await drawHeader(doc, {
    schoolName: params.schoolName,
    logoUrl: params.logoUrl,
    subtitle: 'Progress Report',
  })

  y = drawStudentInfo(doc, y, params)

  for (const field of params.fields) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(field.label, 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const wrapped = doc.splitTextToSize(field.value.trim() === '' ? '-' : field.value, 170)
    doc.text(wrapped, 20, y)
    y += wrapped.length * 6 + 6
    if (y > 260) {
      doc.addPage()
      y = 20
    }
  }

  doc.save(
    `${params.studentName.replace(/\s+/g, '_')}_${params.termName.replace(/\s+/g, '_')}_progress_report.pdf`,
  )
}
