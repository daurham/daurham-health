export type FeatureId =
  | 'today'
  | 'nutrition'
  | 'training'
  | 'body'
  | 'progress'

export type NavItem = {
  id: FeatureId
  to: string
  label: string
}
