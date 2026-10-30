import https from 'https'

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT_ID = 'prj_9yq2WyOEWNbfXMuRl4oQbWCDI9xd'
const TEAM_ID = 'team_WqoyIiavBLrfbGlwD2UqGZPW'

const envVars = [
  {
    type: 'encrypted',
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    value: 'https://uztssyrheqdhtoheecgf.supabase.co',
    target: ['production', 'preview', 'development'],
  },
  {
    type: 'encrypted',
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dHNzeXJoZXFkaHRvaGVlY2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDAyOTUsImV4cCI6MjA5MDU3NjI5NX0.8gZ3jdYv6tYmcEuT3RtgvBLHwHAXBKEvqDdxhEscLPo',
    target: ['production', 'preview', 'development'],
  },
]

const data = JSON.stringify(envVars)

const options = {
  hostname: 'api.vercel.com',
  path: `/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&upsert=true`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Length': Buffer.byteLength(data),
  },
}

const req = https.request(options, (res) => {
  let body = ''
  res.on('data', chunk => body += chunk)
  res.on('end', () => {
    console.log('Status:', res.statusCode)
    console.log('Response:', body)
  })
})

req.on('error', e => console.error('Error:', e))
req.write(data)
req.end()
