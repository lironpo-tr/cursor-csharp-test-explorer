import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { log, logError } from '../utils/outputChannel';

const TEST_FRAMEWORK_PACKAGES = [
    'nunit',
    'xunit',
    'xunit.core',
    'mstest.testframework',
    'microsoft.net.test.sdk',
    'nunit3testadapter',
    'xunit.runner.visualstudio',
    'mstest.testadapter',
];

export interface TestProject {
    csprojPath: string;
    projectName: string;
    projectDir: string;
    frameworks: string[];
}

export async function detectTestProjects(): Promise<TestProject[]> {
    const excludePatterns = vscode.workspace
        .getConfiguration('csharpTestExplorer')
        .get<string[]>('excludeProjects', []);

    const csprojFiles = await vscode.workspace.findFiles(
        '**/*.csproj',
        '{**/node_modules/**,**/bin/**,**/obj/**}'
    );

    const projects: TestProject[] = [];

    for (const uri of csprojFiles) {
        const filePath = uri.fsPath;

        if (isExcluded(filePath, excludePatterns)) {
            continue;
        }

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const frameworks = detectFrameworks(content);

            if (frameworks.length > 0) {
                projects.push({
                    csprojPath: filePath,
                    projectName: path.basename(filePath, '.csproj'),
                    projectDir: path.dirname(filePath),
                    frameworks,
                });
            }
        } catch (err) {
            logError(`Failed to read ${filePath}`, err);
        }
    }

    log(`Detected ${projects.length} test project(s): ${projects.map(p => p.projectName).join(', ')}`);
    return projects;
}

function detectFrameworks(csprojContent: string): string[] {
    const lower = csprojContent.toLowerCase();
    const found: string[] = [];

    for (const pkg of TEST_FRAMEWORK_PACKAGES) {
        const pattern = new RegExp(`include\\s*=\\s*"${pkg}"`, 'i');
        if (pattern.test(csprojContent)) {
            const framework = classifyFramework(pkg);
            if (framework && !found.includes(framework)) {
                found.push(framework);
            }
        }
    }

    return found;
}

function classifyFramework(packageName: string): string | undefined {
    const lower = packageName.toLowerCase();
    if (lower.startsWith('nunit')) { return 'NUnit'; }
    if (lower.startsWith('xunit')) { return 'xUnit'; }
    if (lower.startsWith('mstest')) { return 'MSTest'; }
    return undefined;
}

function isExcluded(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
        if (filePath.includes(pattern)) {
            return true;
        }
    }
    return false;
}
