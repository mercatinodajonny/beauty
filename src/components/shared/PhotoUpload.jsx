import { useState } from 'react'
import { T } from '../../styles/tokens'
import { supabase } from '../../lib/supabase'

export function PhotoUpload({ bucket, path, onUpload, children }) {
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${path}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(bucket).upload(filePath, file)
      if (error) throw error
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
      onUpload(data.publicUrl)
    } finally {
      setUploading(false)
    }
  }

  return (
    <label style={{ cursor: 'pointer', display: 'inline-block' }}>
      <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {uploading ? <span style={{ fontSize: 12, color: T.inkSoft }}>Caricamento...</span> : children}
    </label>
  )
}
