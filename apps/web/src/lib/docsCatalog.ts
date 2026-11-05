export type DocsEntry = {
  slug: string;
  sourcePath: string;
  title: string;
  description: string;
  group: string;
  kind?: "article" | "diagram";
};

export const docsEntries: DocsEntry[] = [
  { slug: "overview", sourcePath: "project-notes/01-project-overview.md", title: "Project overview", description: "What the application does, its boundaries, and the main user workflows.", group: "Start here" },
  { slug: "tech-stack", sourcePath: "project-notes/02-tech-stack-deep-dive.md", title: "Technology stack", description: "Libraries, runtimes, alternatives, and the costs they remove or add.", group: "Understand the system" },
  { slug: "architecture", sourcePath: "project-notes/03-architecture-and-design-decisions.md", title: "Architecture", description: "Process boundaries, package relationships, consistency, and trade-offs.", group: "Understand the system" },
  { slug: "file-reference", sourcePath: "project-notes/04-folder-and-file-reference.md", title: "Folder reference", description: "What each application and shared package owns.", group: "Understand the system" },
  { slug: "file-catalog", sourcePath: "project-notes/04-file-catalog.md", title: "Tracked file catalog", description: "A searchable inventory of tracked source and configuration files.", group: "Understand the system" },
  { slug: "features", sourcePath: "project-notes/05-feature-and-code-walkthroughs.md", title: "Feature walkthroughs", description: "Trace editor, account, scene, room, collaboration, and library flows.", group: "Understand the system" },
  { slug: "database", sourcePath: "project-notes/06-database-and-data-models.md", title: "Database and data models", description: "PostgreSQL schema, constraints, revisions, migrations, and queries.", group: "Understand the system" },
  { slug: "security", sourcePath: "project-notes/07-authentication-and-security.md", title: "Authentication and security", description: "Sessions, room permissions, tickets, secrets, and review areas.", group: "Understand the system" },
  { slug: "api-realtime", sourcePath: "project-notes/08-api-and-realtime-workflows.md", title: "API and realtime", description: "HTTP request lifecycle, WebSocket protocol, and collaboration sync.", group: "Understand the system" },
  { slug: "testing", sourcePath: "project-notes/09-testing-and-code-quality.md", title: "Testing and code quality", description: "Test runners, current coverage evidence, and a workflow for new features.", group: "Build and operate" },
  { slug: "development", sourcePath: "project-notes/10-development-and-deployment-guide.md", title: "Development and deployment", description: "Setup, environment names, commands, deployment paths, and troubleshooting.", group: "Build and operate" },
  { slug: "scalability", sourcePath: "project-notes/13-scalability-and-performance.md", title: "Performance and scalability", description: "What exists today, where load may concentrate, and how to measure next.", group: "Build and operate" },
  { slug: "improvements", sourcePath: "project-notes/14-improvements-and-technical-debt.md", title: "Improvement roadmap", description: "Evidence-based issues and a prioritized path to address them.", group: "Build and operate" },
  { slug: "interview", sourcePath: "project-notes/11-interview-questions-and-answers.md", title: "Interview questions", description: "Project-specific answers, follow-ups, and a whiteboard outline.", group: "Interview preparation" },
  { slug: "rebuild", sourcePath: "project-notes/12-build-from-scratch-guide.md", title: "Build from scratch", description: "A staged reconstruction plan, from requirements to operations.", group: "Interview preparation" },
  { slug: "improvement-proposals", sourcePath: "project-notes/17-improvement-proposals-and-interview-defense.md", title: "Improvement proposals", description: "Implementation plans, trade-offs, and how to defend deferred work.", group: "Interview preparation" },
  { slug: "glossary", sourcePath: "project-notes/15-glossary-and-quick-revision.md", title: "Glossary and quick revision", description: "Short definitions, a project pitch, and key architectural boundaries.", group: "Interview preparation" },
  { slug: "coverage", sourcePath: "project-notes/16-coverage-and-validation.md", title: "Coverage and validation", description: "What the documentation verified and what still needs investigation.", group: "Reference" },
  { slug: "deployment-guides/overview", sourcePath: "README.md", title: "Existing docs index", description: "The repository’s original implementation and deployment notes.", group: "Reference" },
  { slug: "deployment-guides/aws-ec2", sourcePath: "aws-ec2-deployment.md", title: "AWS EC2 deployment", description: "The repository’s EC2 deployment runbook.", group: "Reference" },
  { slug: "deployment-guides/aws-live", sourcePath: "aws-ec2-live.md", title: "AWS live deployment notes", description: "Existing live environment notes from the repository.", group: "Reference" },
  { slug: "deployment-guides/instacloud", sourcePath: "instacloud-deployment.md", title: "InstaCloud deployment", description: "The repository’s InstaCloud deployment runbook.", group: "Reference" },
  { slug: "diagrams/system-architecture", sourcePath: "project-notes/diagrams/system-architecture.mmd", title: "System architecture", description: "Browser, HTTP, WebSocket, worker, PostgreSQL, and Redis at a glance.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/repository-architecture", sourcePath: "project-notes/diagrams/repository-architecture.mmd", title: "Repository architecture", description: "Applications and the shared packages they depend on.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/frontend-architecture", sourcePath: "project-notes/diagrams/frontend-architecture.mmd", title: "Frontend architecture", description: "App routes, components, hooks, engine, persistence, and sync.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/backend-architecture", sourcePath: "project-notes/diagrams/backend-architecture.mmd", title: "Backend architecture", description: "HTTP middleware/routes, WebSocket protocol, shared packages, and worker.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/database-er", sourcePath: "project-notes/diagrams/database-er.mmd", title: "Database ER diagram", description: "Entities, ownership, memberships, claims, and scene revisions.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/authentication-flow", sourcePath: "project-notes/diagrams/authentication-flow.mmd", title: "Authentication flow", description: "Session creation, protected requests, and sign-out.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/api-request-lifecycle", sourcePath: "project-notes/diagrams/api-request-lifecycle.mmd", title: "API request lifecycle", description: "A protected browser request from cookie to JSON response.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/realtime-workflow", sourcePath: "project-notes/diagrams/realtime-workflow.mmd", title: "Realtime workflow", description: "Ticketed socket connection, validation, presence, and commits.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/deployment-workflow", sourcePath: "project-notes/diagrams/deployment-workflow.mmd", title: "Deployment workflow", description: "Workspace tasks and documented frontend/backend deployment paths.", group: "Diagrams", kind: "diagram" },
  { slug: "diagrams/feature-workflows/room-collaboration", sourcePath: "project-notes/diagrams/feature-workflows/room-collaboration.mmd", title: "Room collaboration", description: "From joining a room through a commit reaching durable storage.", group: "Diagrams", kind: "diagram" },
];

export const docBySlug = new Map(docsEntries.map((entry) => [entry.slug, entry]));
export const docBySourcePath = new Map(docsEntries.map((entry) => [entry.sourcePath, entry]));
export const docGroups = [...new Set(docsEntries.map((entry) => entry.group))];

export function docsHref(slug: string) {
  return `/docs/${slug}`;
}
