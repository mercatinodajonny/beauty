import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useClients(businessId) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    fetchClients()
  }, [businessId])

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('pro_clients')
      .select('*')
      .eq('business_id', businessId)
      .order('name')
    if (!error) setClients(data || [])
    setLoading(false)
  }

  const addClient = async (client) => {
    const { data, error } = await supabase
      .from('pro_clients')
      .insert({ ...client, business_id: businessId })
      .select()
      .single()
    if (error) throw error
    await fetchClients()
    return data
  }

  const updateClient = async (id, updates) => {
    const { error } = await supabase
      .from('pro_clients')
      .update(updates)
      .eq('id', id)
    if (error) throw error
    await fetchClients()
  }

  return { clients, loading, addClient, updateClient, refetch: fetchClients }
}
