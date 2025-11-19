import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

interface GitStatus {
  currentCommit: string;
  currentCommitShort: string;
  currentBranch: string;
  remoteCommit: string;
  remoteCommitShort: string;
  hasUpdates: boolean;
  behindBy: number;
  lastCommitMessage: string;
  lastCommitDate: string;
  error?: string;
}

export async function GET() {
  try {
    // Get current commit hash
    const { stdout: currentCommit } = await execAsync('git rev-parse HEAD');
    const currentCommitHash = currentCommit.trim();

    // Get current commit short hash
    const { stdout: currentCommitShort } = await execAsync('git rev-parse --short HEAD');
    const currentCommitShortHash = currentCommitShort.trim();

    // Get current branch
    const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD');
    const branch = currentBranch.trim();

    // Get last commit message
    const { stdout: lastMessage } = await execAsync('git log -1 --pretty=%B');
    const lastCommitMessage = lastMessage.trim();

    // Get last commit date
    const { stdout: lastDate } = await execAsync('git log -1 --pretty=%cr');
    const lastCommitDate = lastDate.trim();

    // Fetch latest from remote (without merging)
    try {
      await execAsync('git fetch origin', { timeout: 5000 });
    } catch (fetchError) {
      console.error('Git fetch failed:', fetchError);
      // Continue even if fetch fails
    }

    // Get remote commit hash
    let remoteCommitHash = currentCommitHash;
    let remoteCommitShortHash = currentCommitShortHash;
    let behindBy = 0;

    try {
      const { stdout: remoteCommit } = await execAsync(`git rev-parse origin/${branch}`);
      remoteCommitHash = remoteCommit.trim();

      const { stdout: remoteCommitShort } = await execAsync(`git rev-parse --short origin/${branch}`);
      remoteCommitShortHash = remoteCommitShort.trim();

      // Count commits behind
      if (currentCommitHash !== remoteCommitHash) {
        const { stdout: behindCount } = await execAsync(
          `git rev-list --count HEAD..origin/${branch}`
        );
        behindBy = parseInt(behindCount.trim(), 10);
      }
    } catch (remoteError) {
      console.error('Failed to get remote commit:', remoteError);
      // If we can't get remote info, assume we're up to date
    }

    const hasUpdates = currentCommitHash !== remoteCommitHash && behindBy > 0;

    const status: GitStatus = {
      currentCommit: currentCommitHash,
      currentCommitShort: currentCommitShortHash,
      currentBranch: branch,
      remoteCommit: remoteCommitHash,
      remoteCommitShort: remoteCommitShortHash,
      hasUpdates,
      behindBy,
      lastCommitMessage,
      lastCommitDate,
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching git status:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch git status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
