import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from '@/components'
import { BodyPage } from '@/features/body'
import { NutritionPage } from '@/features/nutrition'
import { ProgressPage } from '@/features/progress'
import { TodayPage } from '@/features/today'
import { TrainingPage } from '@/features/training'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'nutrition', element: <NutritionPage /> },
      { path: 'training', element: <TrainingPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'progress', element: <ProgressPage /> },
    ],
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
