type HealthRequest = {
  method?: string
}

type HealthResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => HealthResponse
  json: (body: unknown) => void
}

export default function handler(req: HealthRequest, res: HealthResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  res.status(200).json({ status: 'ok' })
}
