import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
  const targetDate = oneHourLater.toISOString().split('T')[0]
  const targetTime = `${String(oneHourLater.getHours()).padStart(2, '0')}:${String(oneHourLater.getMinutes()).padStart(2, '0')}`

  const { data: appts, error } = await supabase
    .from('appointments')
    .select('*, profiles!appointments_client_id_fkey(name, phone)')
    .eq('date', targetDate)
    .eq('time', targetTime)
    .eq('status', 'confermato')

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // In produzione: integrare con servizio SMS/push (es. Twilio, OneSignal)
  console.log(`Promemoria da inviare: ${appts?.length ?? 0} appuntamenti`)

  return new Response(JSON.stringify({ sent: appts?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
