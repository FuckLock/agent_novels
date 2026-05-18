import { NextResponse } from 'next/server';
import { createProject, listProjects, projectErrorResponse } from '@/app/lib/server/projects/project-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('获取项目列表失败:', error);
    return NextResponse.json({ error: '获取项目列表失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const project = await createProject(await request.json());
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const response = projectErrorResponse(error);
    console.error('创建项目失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
