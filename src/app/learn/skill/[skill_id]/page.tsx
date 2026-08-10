import { redirect } from 'next/navigation'

export default function SkillLearnPage({ params }: { params: { skill_id: string } }) {
  redirect(`/learn?skill_id=${encodeURIComponent(params.skill_id)}`)
}
