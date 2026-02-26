/**
 * TRACKWISE — Tasks API Diagnostic v2
 * Handles pagination. Shows completed + hidden tasks.
 * Delete this file after debugging.
 */

function debugTasks() {
  const output   = [];
  const lists    = Tasks.Tasklists.list({ maxResults: 100 });

  if (!lists.items || lists.items.length === 0) {
    SpreadsheetApp.getUi().alert('No task lists found.');
    return;
  }

  output.push(`Task lists found: ${lists.items.length}\n`);

  lists.items.forEach(list => {
    output.push(`\n── "${list.title}"`);

    let pageToken = null;
    let taskCount = 0;

    do {
      const params = {
        showCompleted: true,
        showHidden:    true,
        maxResults:    100,
      };
      if (pageToken) params.pageToken = pageToken;

      const page = Tasks.Tasks.list(list.id, params);

      if (page.items) {
        page.items.forEach(task => {
          taskCount++;
          output.push(
            `  [${task.status}] "${task.title}" | completed: ${task.completed || 'null'}`
          );
        });
      }

      pageToken = page.nextPageToken || null;

    } while (pageToken);

    if (taskCount === 0) output.push('  (empty)');
  });

  const text = output.join('\n');
  Logger.log(text);

  // Show in popup (capped at 1500 chars) and log full output
  SpreadsheetApp.getUi().alert(
    text.length > 1500 ? text.substring(0, 1500) + '\n\n[truncated — see Logs]' : text
  );
}
