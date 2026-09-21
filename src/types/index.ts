export type FeatureId =
  | 'dashboard'
  | 'nutrition'
  | 'training'
  | 'body'
  | 'insights'

export type NavItem = {
  id: FeatureId
  to: string
  label: string
}
