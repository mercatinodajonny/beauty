import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useBusiness(ownerId) {
  const [business, setBusiness] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ownerId) return
    fetchBusiness()
  }, [ownerId])

  const fetchBusiness = async () => {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', ownerId)
      .single()
    if (!error) setBusiness(data)
    setLoading(false)
  }

  const updateBusiness = async (updates) => {
    if (!business) return
    const { error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', business.id)
    if (error) throw error
    await fetchBusiness()
  }

  return { business, loading, updateBusiness, refetch: fetchBusiness }
}
