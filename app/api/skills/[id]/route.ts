import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getOracleSkillContent,
  listOracleCatalogSkills,
} from "@/lib/ai/skills/catalog";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const meta = listOracleCatalogSkills().find((skill) => skill.id === id);
  const content = getOracleSkillContent(id);

  if (!meta || content === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: meta.id,
    name: meta.name,
    content,
  });
}
