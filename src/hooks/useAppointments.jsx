import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAppointments(businessId, date) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    fetchAppointments()

    const channel = supabase
      .channel('appointments')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `business_id=eq.${businessId}`
      }, () => fetchAppointments())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [businessId, date])

  const fetchAppointments = async () => {
    const query = supabase
      .from('appointments')
      .select(`
        *,
        service:services(name, price, duration_min),
        staff:staff(name, emoji),
        client:pro_clients(name, phone, note)
      `)
      .eq('business_id', businessId)
      .order('time', { ascending: true })

    if (date) query.eq('date', date)

    const { data, error } = await query
    if (!error) setAppointments(data || [])
    setLoading(false)
  }

  const addAppointment = async (appt) => {
    const { data: conflicts } = await supabase
      .from('appointments')
      .select('id, time, service:services(duration_min)')
      .eq('business_id', businessId)
      .eq('staff_id', appt.staff_id)
      .eq('date', appt.date)
      .neq('status', 'cancellato')

    const newStart = timeToMin(appt.time)
    const newEnd = newStart + appt.duration_min
    const conflict = conflicts?.find(c => {
      const s = timeToMin(c.time)
      const e = s + (c.service?.duration_min || 30)
      return s < newEnd && e > newStart
    })
    if (conflict) throw new Error('CONFLICT')

    const { data, error } = await supabase.from('appointments').insert(appt).select().single()
    if (error) throw error
    await fetchAppointments()
    return data
  }

  const updateStatus = async (id, status) => {
    await supabase.from('appointments').update({ status }).eq('id', id)
    await fetchAppointments()
  }

  const deleteAppointment = async (id) => {
    await supabase.from('appointments').update({ status: 'cancellato' }).eq('id', id)
    await fetchAppointments()
  }

  return { appointments, loading, addAppointment, updateStatus, deleteAppointment }
}

const timeToMin = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
