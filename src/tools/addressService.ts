const GOOGLE_MAPS_API_KEY = process.env['GOOGLE_MAPS_API_KEY'] || process.env['GOOGLE_API_KEY'] || ''
const STORE_ADDRESS = process.env['STORE_ADDRESS'] || 'Rua Padre Carvalho, 388, São Paulo, SP'
const DELIVERY_RADIUS_KM = Number(process.env['DELIVERY_RADIUS_KM'] ?? 5)

interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress: string
}

async function geocode(address: string): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
  const res = await fetch(url)
  const data = await res.json() as { status: string; results: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }> }

  if (data.status !== 'OK' || !data.results?.[0]) return null

  const { lat, lng } = data.results[0].geometry.location
  return { lat, lng, formattedAddress: data.results[0].formatted_address }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface AddressValidationResult {
  valid: boolean
  distanceKm: number
  formattedAddress: string
  error?: string
}

export async function validateDeliveryAddress(customerAddress: string): Promise<AddressValidationResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('[addressService] GOOGLE_MAPS_API_KEY não configurada — validação de endereço desabilitada')
    return { valid: true, distanceKm: 0, formattedAddress: customerAddress }
  }

  const customerQuery = customerAddress.toLowerCase().includes('são paulo') || customerAddress.toLowerCase().includes('sp')
    ? customerAddress
    : `${customerAddress}, São Paulo, SP`

  const [store, customer] = await Promise.all([
    geocode(STORE_ADDRESS),
    geocode(customerQuery),
  ])

  if (!store) {
    console.error('[addressService] Não foi possível geocodificar o endereço da loja')
    return { valid: true, distanceKm: 0, formattedAddress: customerAddress }
  }

  if (!customer) {
    return { valid: false, distanceKm: 0, formattedAddress: customerAddress, error: 'Endereço não encontrado' }
  }

  const distanceKm = Math.round(haversineKm(store.lat, store.lng, customer.lat, customer.lng) * 10) / 10

  return {
    valid: distanceKm <= DELIVERY_RADIUS_KM,
    distanceKm,
    formattedAddress: customer.formattedAddress,
  }
}
