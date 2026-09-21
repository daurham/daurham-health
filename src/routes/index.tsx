import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from '@/components'
import { BodyPage } from '@/features/body'
import { DashboardPage } from '@/features/dashboard'
import { InsightsPage } from '@/features/insights'
import { NutritionPage } from '@/features/nutrition'
import { TrainingPage } from '@/features/training'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'nutrition', element: <NutritionPage /> },
      { path: 'training', element: <TrainingPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'insights', element: <InsightsPage /> },
    ],
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
