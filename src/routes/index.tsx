import { lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ResetPasswordPage, SignInPage } from '@/auth'
import { Layout } from '@/components'
import { NotFoundPage } from '@/components/NotFoundPage'
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary'
import { TodayPage } from '@/features/today'

const NutritionPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.NutritionPage })))
const RecipesPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.RecipesPage })))
const PantryPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.PantryPage })))
const NewRecipePage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.NewRecipePage })))
const RecipeDetailPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.RecipeDetailPage })))
const RecipeEditPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.RecipeEditPage })))
const RecipeVersionPage = lazy(() => import('@/features/nutrition').then((module) => ({ default: module.RecipeVersionPage })))
const BodyPage = lazy(() => import('@/features/body').then((module) => ({ default: module.BodyPage })))
const BodyInboxPage = lazy(() => import('@/features/body').then((module) => ({ default: module.BodyInboxPage })))
const SettingsPage = lazy(() => import('@/features/settings').then((module) => ({ default: module.SettingsPage })))
const SupplementsPage = lazy(() => import('@/features/supplements').then((module) => ({ default: module.SupplementsPage })))
const ContextPage = lazy(() => import('@/features/context').then((module) => ({ default: module.ContextPage })))
const LabPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.LabPage })))
const SuggestionReviewPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.SuggestionReviewPage })))
const DemoLabPage = lazy(() => import('@/features/demo/DemoLabPage').then((module) => ({ default: module.DemoLabPage })))
const NewExperimentPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.NewExperimentPage })))
const ExperimentDetailPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.ExperimentDetailPage })))
const ReviewExperimentResultPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.ReviewExperimentResultPage })))
const ExperimentResultDetailPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.ExperimentResultDetailPage })))
const NewBenchmarkPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.NewBenchmarkPage })))
const BenchmarkDetailPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.BenchmarkDetailPage })))
const RecordBenchmarkResultPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.RecordBenchmarkResultPage })))
const ReviewBenchmarkResultPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.ReviewBenchmarkResultPage })))
const BenchmarkResultDetailPage = lazy(() => import('@/features/lab').then((module) => ({ default: module.BenchmarkResultDetailPage })))
const TrainingPage = lazy(() => import('@/features/training').then((module) => ({ default: module.TrainingPage })))
const TrainingPlanPage = lazy(() => import('@/features/training').then((module) => ({ default: module.TrainingPlanPage })))
const StartWorkoutPage = lazy(() => import('@/features/training').then((module) => ({ default: module.StartWorkoutPage })))
const ImportWorkoutPage = lazy(() => import('@/features/training').then((module) => ({ default: module.ImportWorkoutPage })))
const WorkoutDetailPage = lazy(() => import('@/features/training').then((module) => ({ default: module.WorkoutDetailPage })))
const RoutinesPage = lazy(() => import('@/features/training').then((module) => ({ default: module.RoutinesPage })))
const ExerciseLibraryPage = lazy(() => import('@/features/training').then((module) => ({ default: module.ExerciseLibraryPage })))
const ProgressPage = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressPage })))
const ProgressOverviewRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressOverviewRoute })))
const ProgressActivityRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressActivityRoute })))
const ProgressSleepRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressSleepRoute })))
const ProgressSleepNightRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressSleepNightRoute })))
const ProgressStrengthRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressStrengthRoute })))
const ProgressStrengthLabRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressStrengthLabRoute })))
const ProgressBodyRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressBodyRoute })))
const ProgressTimelineRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressTimelineRoute })))
const ProgressCompareRoute = lazy(() => import('@/features/progress').then((module) => ({ default: module.ProgressCompareRoute })))
const WeeklyCoachPage = lazy(() => import('@/features/weekly-coach/WeeklyCoachPage').then((module) => ({ default: module.WeeklyCoachPage })))
const GoalsPage = lazy(() => import('@/features/goals/GoalsPages').then((module) => ({ default: module.GoalsPage })))
const GoalDetailPage = lazy(() => import('@/features/goals/GoalsPages').then((module) => ({ default: module.GoalDetailPage })))
const AskHealthPage = lazy(() => import('@/features/ask-health/AskHealthPage').then((module) => ({ default: module.AskHealthPage })))
const RewardsPage = lazy(() => import('@/features/rewards').then((module) => ({ default: module.RewardsPage })))
const DemoTodayPage = lazy(() => import('@/features/demo/DemoTodayPage').then((module) => ({ default: module.DemoTodayPage })))
const DemoNutritionPage = lazy(() => import('@/features/demo/DemoNutritionPage').then((module) => ({ default: module.DemoNutritionPage })))
const DemoTrainingPage = lazy(() => import('@/features/demo/DemoTrainingPage').then((module) => ({ default: module.DemoTrainingPage })))
const DemoWorkoutPage = lazy(() => import('@/features/demo/DemoTrainingPage').then((module) => ({ default: module.DemoWorkoutPage })))
const DemoBodyPage = lazy(() => import('@/features/demo/DemoBodyPage').then((module) => ({ default: module.DemoBodyPage })))
const DemoProgressPage = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressPage })))
const DemoProgressOverviewRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressOverviewRoute })))
const DemoProgressActivityRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressActivityRoute })))
const DemoProgressSleepRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressSleepRoute })))
const DemoSleepNightRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoSleepNightRoute })))
const DemoProgressStrengthRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressStrengthRoute })))
const DemoProgressStrengthLabRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressStrengthLabRoute })))
const DemoProgressBodyRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressBodyRoute })))
const DemoProgressTimelineRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressTimelineRoute })))
const DemoProgressCompareRoute = lazy(() => import('@/features/demo/DemoProgressPage').then((module) => ({ default: module.DemoProgressCompareRoute })))
const DemoWeeklyCoachPage = lazy(() => import('@/features/demo/DemoWeeklyCoachPage').then((module) => ({ default: module.DemoWeeklyCoachPage })))
const DemoAskHealthPage = lazy(() => import('@/features/demo/DemoAskHealthPage').then((module) => ({ default: module.DemoAskHealthPage })))

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'nutrition', element: <NutritionPage /> },
      { path: 'nutrition/pantry', element: <PantryPage /> },
      { path: 'nutrition/recipes', element: <RecipesPage /> },
      { path: 'nutrition/recipes/new', element: <NewRecipePage /> },
      { path: 'nutrition/recipes/:recipeId/edit', element: <RecipeEditPage /> },
      { path: 'nutrition/recipes/:recipeId/versions/:version', element: <RecipeVersionPage /> },
      { path: 'nutrition/recipes/:recipeId', element: <RecipeDetailPage /> },
      { path: 'training', element: <TrainingPage /> },
      { path: 'training/plan', element: <TrainingPlanPage /> },
      { path: 'training/new', element: <StartWorkoutPage /> },
      { path: 'training/import', element: <ImportWorkoutPage /> },
      { path: 'training/exercises', element: <ExerciseLibraryPage /> },
      { path: 'training/routines', element: <RoutinesPage /> },
      { path: 'training/:sessionId', element: <WorkoutDetailPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'body/inbox/:captureId', element: <BodyInboxPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'supplements', element: <SupplementsPage /> },
      { path: 'context', element: <ContextPage /> },
      { path: 'lab', element: <LabPage /> },
      { path: 'lab/suggestions/*', element: <SuggestionReviewPage /> },
      { path: 'goals', element: <GoalsPage /> },
      { path: 'goals/:goalId', element: <GoalDetailPage /> },
      { path: 'ask-health', element: <AskHealthPage /> },
      { path: 'rewards', element: <RewardsPage /> },
      { path: 'lab/experiments/new', element: <NewExperimentPage /> },
      { path: 'lab/experiments/:experimentId/result', element: <ReviewExperimentResultPage /> },
      { path: 'lab/experiments/:experimentId', element: <ExperimentDetailPage /> },
      { path: 'lab/experiment-results/:resultId', element: <ExperimentResultDetailPage /> },
      { path: 'lab/benchmarks/new', element: <NewBenchmarkPage /> },
      { path: 'lab/benchmarks/:benchmarkId/record', element: <RecordBenchmarkResultPage /> },
      { path: 'lab/benchmarks/:benchmarkId', element: <BenchmarkDetailPage /> },
      { path: 'lab/results/review', element: <ReviewBenchmarkResultPage /> },
      { path: 'lab/benchmark-results/:resultId', element: <BenchmarkResultDetailPage /> },
      {
        path: 'progress',
        element: <ProgressPage />,
        children: [
          { index: true, element: <ProgressOverviewRoute /> },
          { path: 'activity', element: <ProgressActivityRoute /> },
          { path: 'sleep/:sleepDate', element: <ProgressSleepNightRoute /> },
          { path: 'sleep', element: <ProgressSleepRoute /> },
          { path: 'strength', element: <ProgressStrengthRoute /> },
          { path: 'strength/:exerciseId', element: <ProgressStrengthLabRoute /> },
          { path: 'body', element: <ProgressBodyRoute /> },
          { path: 'timeline', element: <ProgressTimelineRoute /> },
          { path: 'compare', element: <ProgressCompareRoute /> },
          { path: 'weekly', element: <WeeklyCoachPage /> },
        ],
      },
      {
        path: 'demo',
        children: [
          { index: true, element: <DemoTodayPage /> },
          { path: 'ask-health', element: <DemoAskHealthPage /> },
          { path: 'nutrition', element: <DemoNutritionPage /> },
          { path: 'training', element: <DemoTrainingPage /> },
          { path: 'training/:sessionId', element: <DemoWorkoutPage /> },
          { path: 'body', element: <DemoBodyPage /> },
          { path: 'lab', element: <DemoLabPage /> },
          {
            path: 'progress',
            element: <DemoProgressPage />,
            children: [
              { index: true, element: <DemoProgressOverviewRoute /> },
              { path: 'activity', element: <DemoProgressActivityRoute /> },
              { path: 'sleep/:sleepDate', element: <DemoSleepNightRoute /> },
              { path: 'sleep', element: <DemoProgressSleepRoute /> },
              { path: 'strength', element: <DemoProgressStrengthRoute /> },
              { path: 'strength/:exerciseId', element: <DemoProgressStrengthLabRoute /> },
              { path: 'body', element: <DemoProgressBodyRoute /> },
              { path: 'timeline', element: <DemoProgressTimelineRoute /> },
              { path: 'compare', element: <DemoProgressCompareRoute /> },
              { path: 'weekly', element: <DemoWeeklyCoachPage /> },
            ],
          },
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
