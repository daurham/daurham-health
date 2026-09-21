import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ResetPasswordPage, SignInPage } from '@/auth'
import { Layout } from '@/components'
import { BodyPage } from '@/features/body'
import { NutritionPage } from '@/features/nutrition'
import { ProgressPage, ProgressOverviewRoute, ProgressStrengthRoute, ProgressStrengthLabRoute, ProgressBodyRoute, ProgressTimelineRoute } from '@/features/progress'
import { TodayPage } from '@/features/today'
import { ImportWorkoutPage, StartWorkoutPage, TrainingPage, WorkoutDetailPage } from '@/features/training'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'nutrition', element: <NutritionPage /> },
      { path: 'training', element: <TrainingPage /> },
      { path: 'training/new', element: <StartWorkoutPage /> },
      { path: 'training/import', element: <ImportWorkoutPage /> },
      { path: 'training/:sessionId', element: <WorkoutDetailPage /> },
      { path: 'body', element: <BodyPage /> },
      {
        path: 'progress',
        element: <ProgressPage />,
        children: [
          { index: true, element: <ProgressOverviewRoute /> },
          { path: 'strength', element: <ProgressStrengthRoute /> },
          { path: 'strength/:exerciseId', element: <ProgressStrengthLabRoute /> },
          { path: 'body', element: <ProgressBodyRoute /> },
          { path: 'timeline', element: <ProgressTimelineRoute /> },
        ],
      },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
    ],
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
