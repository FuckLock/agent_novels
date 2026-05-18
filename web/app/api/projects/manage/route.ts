import { NextResponse } from 'next/server';
import { createProject, projectErrorResponse, softDeleteProject } from '@/app/lib/server/projects/project-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const project = await createProject(await request.json());
    return NextResponse.json({ success: true, project }, { status: 201 });
  } catch (error) {
    const response = projectErrorResponse(error);
    console.error('创建项目失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const { name } = await request.json();
    await softDeleteProject(name);
    return NextResponse.json({ success: true });
  } catch (error) {
    const response = projectErrorResponse(error);
    console.error('删除项目失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
