-- 003_seed_beaches.sql
-- Popula as 8 praias iniciais do Rio de Janeiro usando as mesmas coordenadas de mockBeaches.ts.

INSERT INTO public.beaches (
  slug,
  name,
  region,
  neighborhood_note,
  latitude,
  longitude,
  sort_order,
  is_active
)
VALUES
  (
    'leme',
    'Leme',
    'Zona Sul',
    'Canto esquerdo de Copacabana, próximo ao Morro do Leme',
    -22.9632,
    -43.1665,
    1,
    true
  ),
  (
    'copacabana',
    'Copacabana',
    'Zona Sul',
    'Postos 3 ao 5, orla clássica com calçadão',
    -22.9719,
    -43.1823,
    2,
    true
  ),
  (
    'arpoador',
    'Arpoador',
    'Zona Sul',
    'Ponta da pedra, ponto de surf e pôr do sol',
    -22.9895,
    -43.1927,
    3,
    true
  ),
  (
    'ipanema',
    'Ipanema',
    'Zona Sul',
    'Postos 8 ao 10, vista para os Dois Irmãos',
    -22.9868,
    -43.2045,
    4,
    true
  ),
  (
    'leblon',
    'Leblon',
    'Zona Sul',
    'Postos 11 e 12, ambiente mais tranquilo',
    -22.9881,
    -43.2238,
    5,
    true
  ),
  (
    'sao-conrado',
    'São Conrado',
    'Zona Sul',
    'Praia do Pepino, mar forte e pista de voo livre',
    -22.9993,
    -43.2641,
    6,
    true
  ),
  (
    'barra-da-tijuca',
    'Barra da Tijuca',
    'Zona Oeste',
    'Posto 3 ao Posto 8, faixa de areia extensa',
    -23.0124,
    -43.3642,
    7,
    true
  ),
  (
    'recreio',
    'Recreio',
    'Zona Oeste',
    'Posto 9 ao Pontal, águas mais abertas',
    -23.0289,
    -43.4651,
    8,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  neighborhood_note = EXCLUDED.neighborhood_note,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
