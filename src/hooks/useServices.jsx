import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useServices(businessId) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    fetchServices()
  }, [businessId])

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .order('name')
    if (!error) setServices(data || [])
    setLoading(false)
  }

  const addService = async (service) => {
    const { data, error } = await supabase
      .from('services')
      .insert({ ...service, business_id: businessId })
      .select()
      .single()
    if (error) throw error
    await fetchServices()
    return data
  }

  const updateService = async (id, updates) => {
    const { error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
    if (error) throw error
    await fetchServices()
  }

  const deleteService = async (id) => {
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) throw error
    await fetchServices()
  }

  return { services, loading, addService, updateService, deleteService }
}
