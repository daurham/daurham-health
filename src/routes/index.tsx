import { lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ResetPasswordPage, SignInPage } from '@/auth'
import { Layout } from '@/components'
import { NotFoundPage } from '@/components/NotFoundPage'
import { TodayPage } from '@/features/today'

const NutritionPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.NutritionPage })))
const BodyPage = lazy(() => import('@/features/body').then((module) => ({ default: module.BodyPage })))
const SettingsPage = lazy(() => import('@/features/settings').then((module) => ({ default: module.SettingsPage })))
const TrainingPage = lazy(() => import('@/features/training').then((module) => ({ default: module.TrainingPage })))
const StartWorkoutPage = lazy(() => import('@/features/training').then((module) => ({ default: module.StartWorkoutPage })))
const ImportWorkoutPage = lazy(() => import('@/features/training').then((module) => ({ default: module.ImportWorkoutPage })))
const WorkoutDetailPage = lazy(() => import('@/features/training').then((module) => ({ default: module.WorkoutDetailPage })))
const ProgressPage = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressPage })))
const ProgressOverviewRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressOverviewRoute })))
const ProgressActivityRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressActivityRoute })))
const ProgressSleepRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressSleepRoute })))
const ProgressStrengthRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressStrengthRoute })))
const ProgressStrengthLabRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressStrengthLabRoute })))
const ProgressBodyRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressBodyRoute })))
const ProgressTimelineRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressTimelineRoute })))
const ProgressCompareRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressCompareRoute })))

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
      { path: 'settings', element: <SettingsPage /> },
      {
        path: 'progress',
        element: <ProgressPage />,
        children: [
          { index: true, element: <ProgressOverviewRoute /> },
          { path: 'activity', element: <ProgressActivityRoute /> },
          { path: 'sleep', element: <ProgressSleepRoute /> },
          { path: 'strength', element: <ProgressStrengthRoute /> },
          { path: 'strength/:exerciseId', element: <ProgressStrengthLabRoute /> },
          { path: 'body', element: <ProgressBodyRoute /> },
          { path: 'timeline', element: <ProgressTimelineRoute /> },
          { path: 'compare', element: <ProgressCompareRoute /> },
        ],
      },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
