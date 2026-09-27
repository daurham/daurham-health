import { demoWeeklyCoach } from '@/demo/weekly-coach'
import { WeeklyCoachView } from '@/features/weekly-coach/WeeklyCoachPage'

export function DemoWeeklyCoachPage() {
  const example = demoWeeklyCoach()
  return (
    <WeeklyCoachView
      brief={example.brief}
      commentary={example.commentary}
      notice={null}
      exampleLabel={example.label}
    />
  )
}
