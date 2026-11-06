import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

const TASK_STATES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'];
const NEXT_PROJECT: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: 'active', label: 'Activate' }, { to: 'archived', label: 'Archive' }],
  active: [{ to: 'on_hold', label: 'Put on hold' }, { to: 'completed', label: 'Mark completed' }],
  on_hold: [{ to: 'active', label: 'Resume' }, { to: 'completed', label: 'Mark completed' }],
  completed: [{ to: 'active', label: 'Reopen' }, { to: 'archived', label: 'Archive' }],
  archived: [{ to: 'completed', label: 'Restore' }],
};

@Component({
  selector: 'fw-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  styles: [`
    .facts { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-4); }
    .facts .v { font-size: var(--text-heading); line-height: var(--lh-heading); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    .board { display: grid; grid-template-columns: repeat(4, minmax(220px, 1fr)); gap: var(--space-3); overflow-x: auto; }
    .col { background: var(--color-bg-sunken); border-radius: var(--radius-lg); padding: var(--space-3); min-height: 240px; transition: background-color var(--dur-1) var(--ease-out); }
    .col.over { background: var(--color-bg-selected); }
    .col h3 { display: flex; justify-content: space-between; margin-bottom: var(--space-3); color: var(--color-text-secondary); }
    .card { background: var(--color-bg-surface); border: var(--hairline) solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-2); cursor: grab; }
    .card:hover { border-color: var(--color-border-control); }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100%); background: var(--color-bg-surface); box-shadow: var(--shadow-overlay); z-index: 41; overflow-y: auto; animation: rise-in var(--dur-2) var(--ease-out); }
    .drawer-head { padding: var(--space-5); border-bottom: var(--hairline) solid var(--color-border); display: flex; gap: var(--space-3); align-items: flex-start; }
    .comment { padding: var(--space-3) 0; border-bottom: var(--hairline) solid var(--color-border); }
    @media (max-width: 1100px) { .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `],
  template: `
    <div class="page">
      @if (error()) { <div class="alert danger">{{ error() }}</div> }
      @if (p(); as p) {
        <a class="small muted row" routerLink="/projects" style="text-decoration:none; margin-bottom: var(--space-3)"><fw-icon name="arrowLeft" />Projects</a>
        <div class="page-head">
          <div>
            <div class="row"><span class="swatch" [style.background]="p.color || 'var(--color-compare)'"></span><h1>{{ p.name }}</h1><fw-status [value]="p.status" /></div>
            <p class="sub">{{ p.code }} · {{ p.client?.name || 'Internal' }} · {{ p.billing_model | label }} · managed by {{ p.manager?.name }}</p>
          </div>
          <div class="row wrap">
            @if (p.conversation_id && session.can('chat.use')) { <a class="btn" [routerLink]="['/chat', p.conversation_id]"><fw-icon name="chat" />Channel</a> }
            @if (p.can_manage) {
              @for (t of transitions(); track t.to) { <button class="btn" (click)="transition(t.to)">{{ t.label }}</button> }
              <button class="btn" (click)="openEdit()" [disabled]="p.status === 'completed' || p.status === 'archived'"><fw-icon name="edit" />Edit</button>
            }
          </div>
        </div>

        <nav class="tabs" aria-label="Project sections">
          @for (t of tabs; track t.key) {
            <button type="button" [class.active]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }}
              @if (t.key === 'tasks') { <span class="count">{{ p.open_tasks }}</span> }</button>
          }
        </nav>

        @switch (tab()) {
          @case ('overview') {
            <div class="panel panel-pad" style="margin-bottom: var(--space-4)">
              <div class="facts">
                <div><div class="small muted">Approved hours</div><div class="v">{{ p.approved_minutes | hours }}{{ p.budget_minutes ? ' / ' + (p.budget_minutes | hours: 0) : '' }}</div>
                  <div class="small faint">{{ p.budget_minutes ? consumed() + '% of hours budget' : 'No hours budget' }}</div></div>
                <div><div class="small muted">Billable</div><div class="v">{{ p.approved_billable_minutes | hours }}h</div></div>
                <div><div class="small muted">Tasks done</div><div class="v">{{ p.done_tasks }} / {{ p.total_tasks }}</div><div class="small faint">{{ p.total_tasks ? taskPct() + '% by count' : 'No tasks' }}</div></div>
                <div><div class="small muted">Dates</div><div class="v" style="font-size: var(--text-body)">{{ p.start_date | day }} – {{ p.end_date ? (p.end_date | day) : 'ongoing' }}</div></div>
                @if (session.can('finance.view')) {
                  <div><div class="small muted">Unbilled approved time</div><div class="v">{{ p.unbilled_cents | money }}</div><div class="small faint">{{ p.billed_cents | money }} billed</div></div>
                }
              </div>
            </div>
            <div class="grid grid-main">
              <div class="panel panel-pad stack-2"><h2>About</h2><p class="muted" style="white-space: pre-line">{{ p.description || 'No description yet.' }}</p></div>
              <div class="panel">
                <div class="panel-head"><h2>Milestones</h2><button class="btn btn-sm btn-ghost" (click)="setTab('milestones')">All</button></div>
                <ul class="list">
                  @for (m of p.milestones.slice(0, 5); track m.id) {
                    <li><span class="grow"><span style="display:block">{{ m.name }}</span><span class="cell-sub">due {{ m.due_date | day }}</span></span><fw-status [value]="milestoneState(m)" /></li>
                  } @empty { <li class="muted">No milestones yet.</li> }
                </ul>
              </div>
            </div>
          }

          @case ('tasks') {
            <div class="toolbar">
              <div class="seg" role="group" aria-label="Task view">
                <button type="button" [attr.aria-pressed]="view() === 'list'" (click)="view.set('list')"><fw-icon name="list" /> List</button>
                <button type="button" [attr.aria-pressed]="view() === 'board'" (click)="view.set('board')"><fw-icon name="board" /> Board</button>
              </div>
              <select class="select" style="width: 180px" aria-label="Assignee filter" [(ngModel)]="assigneeFilter"><option value="">Everyone</option>
                @for (m of p.members; track m.id) { <option [value]="m.user_id">{{ m.user?.name }}</option> }</select>
              <div class="grow"></div>
              @if (canManageTasks()) { <button class="btn btn-primary" (click)="openTask(null)"><fw-icon name="plus" />New task</button> }
            </div>
            @if (view() === 'list') {
              <div class="panel">
                @if (filteredTasks().length) {
                  <div class="table-wrap"><table class="table">
                    <thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      @for (t of filteredTasks(); track t.id) {
                        <tr class="clickable" (click)="openTask(t)">
                          <td><span class="cell-title">{{ t.title }}</span>@if (t.milestone) { <span class="cell-sub" style="display:block">{{ t.milestone.name }}</span> }</td>
                          <td>@if (t.assignee) { <span class="row"><fw-avatar [name]="t.assignee.name" />{{ t.assignee.name }}</span> } @else { <span class="faint">Unassigned</span> }</td>
                          <td><fw-status [value]="t.priority" /></td>
                          <td class="tabular" [class]="isOverdue(t) ? 'tabular reason' : 'tabular'" [style.color]="isOverdue(t) ? 'var(--color-danger)' : null">{{ t.due_date ? (t.due_date | day) : '—' }}</td>
                          <td (click)="$event.stopPropagation()">
                            @if (canMove(t)) {
                              <select class="select sm" style="width: 130px" [attr.aria-label]="'Status of ' + t.title" [ngModel]="t.status" (ngModelChange)="move(t, $event)">
                                @for (s of states; track s) { <option [value]="s">{{ s | label }}</option> }</select>
                            } @else { <fw-status [value]="t.status" /> }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table></div>
                } @else {
                  <fw-empty icon="list" title="No tasks yet" text="Break the work into tasks with an owner and a due date." hint="Tasks feed the completion count on this project.">
                    @if (canManageTasks()) { <button class="btn btn-primary" (click)="openTask(null)">Add the first task</button> }
                  </fw-empty>
                }
              </div>
            } @else {
              <p class="small muted" style="margin-bottom: var(--space-3)">Drag cards between columns, or open a card and change its status.</p>
              <div class="board">
                @for (s of states.slice(0, 4); track s) {
                  <div class="col" [class.over]="dragOver() === s" (dragover)="$event.preventDefault(); dragOver.set(s)" (dragleave)="dragOver.set(null)" (drop)="drop(s)">
                    <h3><span>{{ s | label }}</span><span class="count">{{ byStatus(s).length }}</span></h3>
                    @for (t of byStatus(s); track t.id) {
                      <div class="card" [attr.draggable]="canMove(t)" (dragstart)="dragging = t" (click)="openTask(t)" tabindex="0" (keydown.enter)="openTask(t)">
                        <div style="font-weight: var(--weight-medium)">{{ t.title }}</div>
                        <div class="spread small" style="margin-top: var(--space-2)"><span class="faint">{{ t.due_date ? (t.due_date | day) : 'No date' }}</span>
                          @if (t.assignee) { <fw-avatar [name]="t.assignee.name" /> }</div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          }

          @case ('milestones') {
            <div class="toolbar"><div class="grow"></div>@if (p.can_manage) { <button class="btn btn-primary" (click)="openMilestone(null)"><fw-icon name="plus" />New milestone</button> }</div>
            <div class="panel">
              @if (p.milestones.length) {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th>Milestone</th><th>Responsible</th><th>Baseline due</th><th>Current due</th><th>Completed</th><th>Delivery</th>@if (p.can_manage) { <th></th> }</tr></thead>
                  <tbody>
                    @for (m of p.milestones; track m.id) {
                      <tr>
                        <td class="cell-title">{{ m.name }}@if (m.cancel_reason) { <span class="cell-sub" style="display:block">{{ m.cancel_reason }}</span> }</td>
                        <td>{{ m.responsible?.name || '—' }}</td>
                        <td class="tabular">{{ m.baseline_due_date | day }}</td>
                        <td class="tabular">{{ m.due_date | day }}@if (m.due_date !== m.baseline_due_date) { <span class="badge" style="margin-left: var(--space-2)">moved</span> }</td>
                        <td class="tabular">{{ m.completed_at ? (m.completed_at | day) : '—' }}</td>
                        <td><fw-status [value]="milestoneState(m)" /></td>
                        @if (p.can_manage) { <td class="num"><button class="btn btn-sm btn-ghost" (click)="openMilestone(m)">Edit</button></td> }
                      </tr>
                    }
                  </tbody>
                </table></div>
              } @else {
                <fw-empty icon="calendar" title="No milestones" text="Milestones keep their original baseline date, so delivery reports show whether they landed on time.">
                  @if (p.can_manage) { <button class="btn btn-primary" (click)="openMilestone(null)">Add a milestone</button> }
                </fw-empty>
              }
            </div>
          }

          @case ('team') {
            <div class="grid grid-2">
              <div class="panel">
                <div class="panel-head"><h2>Team</h2>
                  @if (p.can_manage) {
                    <div class="row"><select class="select sm" style="width: 180px" aria-label="Person to add" [(ngModel)]="addUserId"><option [ngValue]="null">Add a person…</option>
                      @for (m of nonMembers(); track m.user.id) { <option [ngValue]="m.user.id">{{ m.user.name }}</option> }</select>
                      <button class="btn btn-sm" [disabled]="!addUserId" (click)="addMember()">Add</button></div>
                  }
                </div>
                <ul class="list">
                  @for (m of p.members; track m.id) {
                    <li><fw-avatar [name]="m.user?.name" /><span class="grow"><span style="display:block">{{ m.user?.name }}</span><span class="cell-sub">{{ m.role || 'Team member' }}</span></span>
                      @if (p.can_manage && m.user_id !== p.manager_id) { <button class="btn btn-sm btn-ghost" (click)="removeMember(m)">Remove</button> }</li>
                  }
                </ul>
              </div>
              <div class="panel">
                <div class="panel-head"><h2>Allocations</h2><a class="small muted" routerLink="/staff" [queryParams]="{ tab: 'capacity' }">Capacity calendar</a></div>
                <ul class="list">
                  @for (a of p.allocations; track a.id) {
                    <li><span class="grow"><span style="display:block">{{ a.staff?.name }}</span><span class="cell-sub">{{ a.start_date | day }} – {{ a.end_date | day }}</span></span><b class="tabular">{{ a.minutes_per_week | hours }}h / week</b></li>
                  } @empty { <li class="muted">No planned allocations. Plans are separate from logged time.</li> }
                </ul>
              </div>
            </div>
          }

          @case ('time') {
            @if (time(); as t) {
              <div class="grid grid-main">
                <div class="panel">
                  <div class="panel-head"><h2>Recent entries</h2><span class="small faint">Submitted and approved</span></div>
                  <div class="table-wrap"><table class="table compact">
                    <thead><tr><th>Date</th><th>Person</th><th>Notes</th><th class="num">Hours</th><th>Status</th></tr></thead>
                    <tbody>@for (e of t.entries; track e.id) {
                      <tr><td class="tabular">{{ e.work_date | day }}</td><td>{{ e.user?.name }}</td><td class="muted truncate" style="max-width: 280px">{{ e.task?.title ? e.task.title + ' · ' : '' }}{{ e.notes }}</td>
                        <td class="num">{{ e.minutes | hours: 2 }}</td><td><fw-status [value]="e.status" />@if (!e.billable) { <span class="badge" style="margin-left: var(--space-1)">Nonbillable</span> }</td></tr>
                    } @empty { <tr><td colspan="5" class="muted">No submitted time yet.</td></tr> }</tbody>
                  </table></div>
                </div>
                <div class="panel">
                  <div class="panel-head"><h2>By person</h2></div>
                  <div class="table-wrap"><table class="table compact">
                    <thead><tr><th>Person</th><th class="num">Approved</th><th class="num">Billable</th><th class="num">Pending</th></tr></thead>
                    <tbody>@for (r of t.by_person; track r.user_id) {
                      <tr><td>{{ r.name }}</td><td class="num">{{ r.approved_minutes | hours }}</td><td class="num">{{ r.billable_minutes | hours }}</td><td class="num">{{ r.submitted_minutes | hours }}</td></tr>
                    }</tbody>
                  </table></div>
                </div>
              </div>
            } @else { <div class="panel panel-pad muted">Loading time…</div> }
          }

          @case ('budget') {
            <div class="grid grid-2">
              <div class="panel panel-pad stack-3">
                <h2>Hours budget</h2>
                @if (p.budget_minutes) {
                  <div class="kpi-figure">{{ p.approved_minutes | hours }}<span class="unit">of {{ p.budget_minutes | hours: 0 }} planned hours</span></div>
                  <div class="meter" [class.warn]="consumed() > 90" [class.over]="consumed() > 100"><span [style.width.%]="min(consumed(), 100)"></span></div>
                  <p class="small muted">{{ consumed() }}% consumed. Approved project hours ÷ planned hours. Submitted time is not counted until approved.</p>
                } @else { <p class="muted">No hours budget is set, so consumption shows as N/A.</p> }
              </div>
              <div class="panel panel-pad stack-3">
                <h2>Money</h2>
                @if (session.can('finance.view')) {
                  <dl class="stack-2" style="margin: 0">
                    <div class="spread"><dt class="muted">Budget</dt><dd class="tabular" style="margin:0">{{ p.budget_amount_cents === null ? 'Not set' : (p.budget_amount_cents | money) }}</dd></div>
                    @if (p.billing_model === 'fixed_fee') { <div class="spread"><dt class="muted">Fixed fee</dt><dd class="tabular" style="margin:0">{{ p.fixed_fee_cents | money }}</dd></div> }
                    @else { <div class="spread"><dt class="muted">Default bill rate</dt><dd class="tabular" style="margin:0">{{ p.default_bill_rate_cents === null ? 'Per person' : (p.default_bill_rate_cents | money) + ' / h' }}</dd></div> }
                    <div class="spread"><dt class="muted">Billed time</dt><dd class="tabular" style="margin:0">{{ p.billed_cents | money }}</dd></div>
                    <div class="spread"><dt class="muted">Approved, not yet invoiced</dt><dd class="tabular" style="margin:0">{{ p.unbilled_cents | money }}</dd></div>
                  </dl>
                  @if (session.can('invoices.manage') && p.client && p.unbilled_cents > 0) {
                    <a class="btn" routerLink="/invoices" [queryParams]="{ new: 1, client_id: p.client.id, project_id: p.id }"><fw-icon name="invoices" />Invoice approved time</a>
                  }
                } @else { <p class="muted">Monetary budgets are visible to finance roles.</p> }
              </div>
            </div>
          }

          @case ('files') {
            <div class="panel">
              <div class="panel-head"><h2>Files</h2>
                <label class="btn btn-sm"><fw-icon name="upload" />Upload<input type="file" class="sr-only" (change)="upload($event)" /></label></div>
              <ul class="list">
                @for (f of files(); track f.id) {
                  <li><fw-icon name="file" /><span class="grow"><span style="display:block">{{ f.name }}</span><span class="cell-sub">{{ size(f.size) }} · {{ f.uploader?.name }} · {{ f.created_at | ago }}</span></span>
                    <button class="btn btn-sm" (click)="download(f)"><fw-icon name="download" />Download</button>
                    <button class="btn btn-sm btn-ghost btn-icon" [attr.aria-label]="'Delete ' + f.name" (click)="deleteFile(f)"><fw-icon name="trash" /></button></li>
                } @empty { <li class="muted">No files. Uploads are private to people on this project.</li> }
              </ul>
            </div>
          }

          @case ('activity') {
            <div class="panel">
              <ul class="list">
                @for (a of activity(); track a.id) {
                  <li style="align-items: flex-start"><fw-avatar [name]="a.user?.name" /><span class="grow"><b style="font-weight: var(--weight-medium)">{{ a.user?.name || 'System' }}</b> <span class="muted">{{ a.summary }}</span>
                    <span class="cell-sub" style="display:block">{{ a.created_at | day: 'long' }}</span></span></li>
                } @empty { <li class="muted">No activity recorded.</li> }
              </ul>
            </div>
          }
        }
      }
    </div>

    @if (taskOpen()) {
      <dialog fwModal #td class="modal side" aria-label="Task" (cancel)="$event.preventDefault(); closeTask()" (click)="$event.target === td && closeTask()">
      <aside class="drawer">
        <div class="drawer-head">
          <div class="grow"><h2>{{ taskForm.id ? taskForm.title : 'New task' }}</h2>
            @if (taskForm.id) { <p class="small muted">Created for {{ p()?.name }}</p> }</div>
          <button class="btn btn-ghost btn-icon" aria-label="Close" (click)="closeTask()"><fw-icon name="x" /></button>
        </div>
        <form class="dialog-body stack-4" (ngSubmit)="saveTask()">
          @if (canManageTasks()) {
            <div class="field"><label for="tt">Title</label><input id="tt" class="input" name="title" [(ngModel)]="taskForm.title" /></div>
            <div class="form-grid">
              <div class="field"><label for="ta">Assignee</label><select id="ta" class="select" name="assignee" [(ngModel)]="taskForm.assignee_id"><option [ngValue]="null">Unassigned</option>
                @for (m of p()?.members; track m.id) { <option [ngValue]="m.user_id">{{ m.user?.name }}</option> }</select></div>
              <div class="field"><label for="tp">Priority</label><select id="tp" class="select" name="prio" [(ngModel)]="taskForm.priority">
                @for (x of ['low','medium','high','urgent']; track x) { <option [value]="x">{{ x | label }}</option> }</select></div>
              <div class="field"><label for="td">Due date</label><input id="td" class="input" type="date" name="due" [(ngModel)]="taskForm.due_date" /></div>
              <div class="field"><label for="ts">Status</label><select id="ts" class="select" name="status" [(ngModel)]="taskForm.status">
                @for (s of states; track s) { <option [value]="s">{{ s | label }}</option> }</select></div>
              <div class="field full"><label for="tm">Milestone</label><select id="tm" class="select" name="ms" [(ngModel)]="taskForm.milestone_id"><option [ngValue]="null">None</option>
                @for (m of p()?.milestones; track m.id) { <option [ngValue]="m.id">{{ m.name }}</option> }</select></div>
            </div>
            <div class="field"><label for="tdesc">Description</label><textarea id="tdesc" class="textarea" name="desc" [(ngModel)]="taskForm.description"></textarea></div>
          } @else {
            <p class="muted" style="white-space: pre-line">{{ taskForm.description || 'No description.' }}</p>
            <div class="small muted">Due {{ taskForm.due_date ? (taskForm.due_date | day) : '—' }} · {{ taskForm.priority | label }} priority</div>
            @if (canMove(taskForm)) {
              <div class="field"><label for="ts2">Status</label><select id="ts2" class="select" name="status" [(ngModel)]="taskForm.status">
                @for (s of states; track s) { <option [value]="s">{{ s | label }}</option> }</select></div>
            }
          }
          @if (taskError()) { <div class="form-error" role="alert">{{ taskError() }}</div> }
          @if (canManageTasks() || canMove(taskForm)) {
            <div class="row"><button class="btn btn-primary" type="submit">{{ taskForm.id ? 'Save task' : 'Create task' }}</button>
              @if (taskForm.id && canManageTasks()) { <button class="btn btn-ghost btn-danger" type="button" (click)="deleteTask()">Delete</button> }</div>
          }
        </form>
        @if (taskForm.id) {
          <div class="dialog-body" style="border-top: var(--hairline) solid var(--color-border)">
            <h3 style="margin-bottom: var(--space-2)">Comments</h3>
            @for (c of comments(); track c.id) {
              <div class="comment"><div class="small"><b style="font-weight: var(--weight-medium)">{{ c.user?.name }}</b> <span class="faint">· {{ c.created_at | ago }}</span></div><p style="white-space: pre-line">{{ c.body }}</p></div>
            } @empty { <p class="small muted">No comments yet.</p> }
            <form class="stack-2" style="margin-top: var(--space-3)" (ngSubmit)="comment()">
              <textarea class="textarea" name="c" aria-label="Comment" placeholder="Write a comment. Mention someone with @email." [(ngModel)]="newComment"></textarea>
              <button class="btn btn-sm" type="submit" [disabled]="!newComment.trim()">Comment</button>
            </form>
          </div>
        }
      </aside>
      </dialog>
    }

    @if (milestoneOpen()) {
      <fw-dialog [title]="msForm.id ? 'Edit milestone' : 'New milestone'" subtitle="The first due date becomes the baseline used for on-time reporting." (close)="milestoneOpen.set(false)">
        <form class="form-grid" id="ms-form" (ngSubmit)="saveMilestone()">
          <div class="field full"><label for="mn">Name</label><input id="mn" class="input" name="n" [(ngModel)]="msForm.name" /></div>
          <div class="field"><label for="md">Due date</label><input id="md" class="input" type="date" name="d" [(ngModel)]="msForm.due_date" />
            @if (msForm.id && msForm.due_date !== msForm.baseline_due_date) { <span class="hint">Baseline stays {{ msForm.baseline_due_date | day }}; the change is recorded.</span> }</div>
          <div class="field"><label for="mr">Responsible</label><select id="mr" class="select" name="r" [(ngModel)]="msForm.responsible_id"><option [ngValue]="null">Nobody</option>
            @for (m of p()?.members; track m.id) { <option [ngValue]="m.user_id">{{ m.user?.name }}</option> }</select></div>
          @if (msForm.id) {
            <div class="field"><label for="mst">Status</label><select id="mst" class="select" name="s" [(ngModel)]="msForm.status">
              @for (s of ['planned','in_progress','completed','cancelled']; track s) { <option [value]="s">{{ s | label }}</option> }</select></div>
            @if (msForm.status === 'cancelled') { <div class="field"><label for="mc">Reason</label><input id="mc" class="input" name="c" [(ngModel)]="msForm.cancel_reason" /></div> }
          }
          @if (msError()) { <div class="form-error full">{{ msError() }}</div> }
        </form>
        <ng-container foot><button class="btn" (click)="milestoneOpen.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="ms-form">Save</button></ng-container>
      </fw-dialog>
    }

    @if (editOpen()) {
      <fw-dialog title="Edit project" (close)="editOpen.set(false)">
        <form class="form-grid" id="ep" (ngSubmit)="saveEdit()">
          <div class="field full"><label for="en">Name</label><input id="en" class="input" name="n" [(ngModel)]="editForm.name" /></div>
          <div class="field"><label for="es">Start</label><input id="es" class="input" type="date" name="s" [(ngModel)]="editForm.start_date" /></div>
          <div class="field"><label for="ee">End</label><input id="ee" class="input" type="date" name="e" [(ngModel)]="editForm.end_date" /></div>
          <div class="field"><label for="eh">Hours budget</label><input id="eh" class="input" type="number" name="h" [(ngModel)]="editForm.hours" /></div>
          @if (session.can('finance.view')) { <div class="field"><label for="ea">Money budget</label><input id="ea" class="input" type="number" step="0.01" name="a" [(ngModel)]="editForm.amount" /></div> }
          <div class="field full"><label for="ed">Description</label><textarea id="ed" class="textarea" name="d" [(ngModel)]="editForm.description"></textarea></div>
          @if (editError()) { <div class="form-error full">{{ editError() }}</div> }
        </form>
        <ng-container foot><button class="btn" (click)="editOpen.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="ep">Save changes</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class ProjectDetailPage implements OnInit {
  id = input.required<string>();
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  tabs = [
    { key: 'overview', label: 'Overview' }, { key: 'tasks', label: 'Tasks' }, { key: 'milestones', label: 'Milestones' }, { key: 'team', label: 'Team' },
    { key: 'time', label: 'Time' }, { key: 'budget', label: 'Budget' }, { key: 'files', label: 'Files' }, { key: 'activity', label: 'Activity' },
  ];
  states = TASK_STATES;
  p = signal<any>(null);
  error = signal('');
  tab = signal('overview');
  view = signal<'list' | 'board'>('list');
  tasks = signal<any[]>([]);
  time = signal<any>(null);
  files = signal<any[]>([]);
  activity = signal<any[]>([]);
  members = signal<any[]>([]);
  assigneeFilter = '';
  dragging: any = null;
  dragOver = signal<string | null>(null);

  taskOpen = signal(false);
  taskForm: any = {};
  taskError = signal('');
  comments = signal<any[]>([]);
  newComment = '';
  milestoneOpen = signal(false);
  msForm: any = {};
  msError = signal('');
  editOpen = signal(false);
  editForm: any = {};
  editError = signal('');
  addUserId: number | null = null;

  transitions = computed(() => NEXT_PROJECT[this.p()?.status] ?? []);
  consumed = computed(() => { const p = this.p(); return p?.budget_minutes ? Math.round(((p.approved_minutes ?? 0) / p.budget_minutes) * 100) : 0; });
  taskPct = computed(() => { const p = this.p(); return p?.total_tasks ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0; });
  nonMembers = computed(() => { const ids = new Set((this.p()?.members ?? []).map((m: any) => m.user_id)); return this.members().filter((m) => !ids.has(m.user.id)); });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.load().then(() => {
      if (q.get('tab')) this.setTab(q.get('tab')!);
      if (q.get('task')) this.api.get<any>(`/tasks/${q.get('task')}`).then((t) => { this.setTab('tasks'); this.openTask(t); }).catch(() => undefined);
    });
    this.api.get<any[]>('/members').then((m) => this.members.set(m.filter((x) => x.status === 'active'))).catch(() => undefined);
  }

  async load(): Promise<void> {
    try {
      this.p.set(await this.api.get(`/projects/${this.id()}`));
      this.tasks.set(await this.api.get(`/projects/${this.id()}/tasks`));
    } catch (e) {
      this.error.set(apiError(e).message);
    }
  }

  setTab(t: string): void {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t === 'overview' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
    if (t === 'time' && !this.time()) this.api.get(`/projects/${this.id()}/time`).then((r) => this.time.set(r));
    if (t === 'files') this.api.get<any[]>(`/projects/${this.id()}/files`).then((r) => this.files.set(r));
    if (t === 'activity') this.api.get<any[]>(`/projects/${this.id()}/activity`).then((r) => this.activity.set(r));
  }

  canManageTasks(): boolean { return !!this.p()?.can_manage && this.session.can('tasks.manage'); }
  canMove(t: any): boolean { return this.canManageTasks() || (t?.assignee_id === this.session.user()?.id && this.session.can('tasks.update_own')); }
  filteredTasks(): any[] { return this.tasks().filter((t) => !this.assigneeFilter || String(t.assignee_id) === this.assigneeFilter); }
  byStatus(s: string): any[] { return this.filteredTasks().filter((t) => t.status === s); }
  isOverdue(t: any): boolean { return !!t.due_date && !['done', 'cancelled'].includes(t.status) && t.due_date < new Date().toISOString().slice(0, 10); }
  min(a: number, b: number): number { return Math.min(a, b); }
  size(b: number): string { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB'; }

  milestoneState(m: any): string {
    if (m.status === 'cancelled') return 'cancelled';
    const today = new Date().toISOString().slice(0, 10);
    if (m.completed_at) return m.completed_at.slice(0, 10) <= m.baseline_due_date ? 'on_time' : 'late';
    if (m.baseline_due_date < today) return 'missed';
    return m.status;
  }

  async move(t: any, status: string): Promise<void> {
    const before = t.status;
    t.status = status;
    this.tasks.set([...this.tasks()]);
    try {
      await this.api.patch(`/tasks/${t.id}`, { status });
      this.refreshCounts();
    } catch (e) {
      t.status = before; // revert: the move was rejected
      this.tasks.set([...this.tasks()]);
      this.toasts.error(apiError(e).message);
    }
  }

  drop(status: string): void {
    this.dragOver.set(null);
    if (this.dragging && this.dragging.status !== status && this.canMove(this.dragging)) this.move(this.dragging, status);
    this.dragging = null;
  }

  private async refreshCounts(): Promise<void> {
    const fresh = await this.api.get<any>(`/projects/${this.id()}`);
    this.p.set(fresh);
  }

  async transition(to: string): Promise<void> {
    try {
      this.p.set(await this.api.post(`/projects/${this.id()}/status`, { status: to }));
      this.toasts.ok(`Project is now ${to.replace('_', ' ')}`);
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  openTask(t: any): void {
    this.taskError.set('');
    this.newComment = '';
    this.comments.set([]);
    this.taskForm = t ? { ...t } : { title: '', assignee_id: null, priority: 'medium', due_date: '', status: 'todo', milestone_id: null, description: '' };
    this.taskOpen.set(true);
    if (t) this.api.get<any>(`/tasks/${t.id}`).then((full) => this.comments.set(full.comments));
  }
  closeTask(): void {
    this.taskOpen.set(false);
    this.router.navigate([], { queryParams: { task: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  async saveTask(): Promise<void> {
    const f = this.taskForm;
    const body = this.canManageTasks()
      ? { title: f.title, assignee_id: f.assignee_id, priority: f.priority, due_date: f.due_date || null, status: f.status, milestone_id: f.milestone_id, description: f.description || null }
      : { status: f.status };
    try {
      if (f.id) await this.api.patch(`/tasks/${f.id}`, body);
      else await this.api.post(`/projects/${this.id()}/tasks`, body);
      this.toasts.ok(f.id ? 'Task saved' : 'Task created');
      this.taskOpen.set(false);
      this.tasks.set(await this.api.get(`/projects/${this.id()}/tasks`));
      this.refreshCounts();
    } catch (e) {
      const { message, fields } = apiError(e);
      this.taskError.set(Object.values(fields)[0] ?? message);
    }
  }

  async deleteTask(): Promise<void> {
    if (!confirm(`Delete “${this.taskForm.title}”? This cannot be undone.`)) return;
    try {
      await this.api.delete(`/tasks/${this.taskForm.id}`);
      this.taskOpen.set(false);
      this.tasks.set(await this.api.get(`/projects/${this.id()}/tasks`));
    } catch (e) { this.taskError.set(apiError(e).message); }
  }

  async comment(): Promise<void> {
    try {
      const c = await this.api.post<any>(`/tasks/${this.taskForm.id}/comments`, { body: this.newComment });
      this.comments.update((list) => [...list, c]);
      this.newComment = '';
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  openMilestone(m: any): void {
    this.msError.set('');
    this.msForm = m ? { ...m, responsible_id: m.responsible_id } : { name: '', due_date: '', responsible_id: null };
    this.milestoneOpen.set(true);
  }

  async saveMilestone(): Promise<void> {
    const f = this.msForm;
    try {
      if (f.id) await this.api.patch(`/projects/${this.id()}/milestones/${f.id}`, { name: f.name, due_date: f.due_date, responsible_id: f.responsible_id, status: f.status, cancel_reason: f.cancel_reason || null });
      else await this.api.post(`/projects/${this.id()}/milestones`, { name: f.name, due_date: f.due_date, responsible_id: f.responsible_id });
      this.milestoneOpen.set(false);
      this.refreshCounts();
      this.toasts.ok('Milestone saved');
    } catch (e) {
      const { message, fields } = apiError(e);
      this.msError.set(Object.values(fields)[0] ?? message);
    }
  }

  async addMember(): Promise<void> {
    try {
      await this.api.post(`/projects/${this.id()}/members`, { user_id: this.addUserId });
      this.addUserId = null;
      this.refreshCounts();
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  async removeMember(m: any): Promise<void> {
    if (!confirm(`Remove ${m.user?.name} from this project? They lose access to its tasks, files and channel.`)) return;
    try {
      await this.api.delete(`/projects/${this.id()}/members/${m.id}`);
      this.refreshCounts();
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const f = await this.api.post<any>(`/projects/${this.id()}/files`, fd);
      this.files.update((list) => [f, ...list]);
      this.toasts.ok(`Uploaded ${f.name}`);
    } catch (e) { this.toasts.error(apiError(e).message); }
    input.value = '';
  }

  download(f: any): void { this.api.download(`/projects/${this.id()}/files/${f.id}`, f.name).catch((e) => this.toasts.error(apiError(e).message)); }

  async deleteFile(f: any): Promise<void> {
    if (!confirm(`Delete ${f.name}?`)) return;
    try {
      await this.api.delete(`/projects/${this.id()}/files/${f.id}`);
      this.files.update((list) => list.filter((x) => x.id !== f.id));
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  openEdit(): void {
    const p = this.p();
    this.editForm = { name: p.name, start_date: p.start_date, end_date: p.end_date, hours: p.budget_minutes ? p.budget_minutes / 60 : null, amount: p.budget_amount_cents !== null && p.budget_amount_cents !== undefined ? p.budget_amount_cents / 100 : null, description: p.description };
    this.editError.set('');
    this.editOpen.set(true);
  }

  async saveEdit(): Promise<void> {
    const f = this.editForm;
    const body: any = { name: f.name, start_date: f.start_date || null, end_date: f.end_date || null, budget_minutes: f.hours ? Math.round(f.hours * 60) : null, description: f.description || null };
    if (this.session.can('finance.view')) body.budget_amount_cents = f.amount === null || f.amount === '' ? null : Math.round(f.amount * 100);
    try {
      this.p.set(await this.api.patch(`/projects/${this.id()}`, body));
      this.editOpen.set(false);
      this.toasts.ok('Project updated');
    } catch (e) {
      const { message, fields } = apiError(e);
      this.editError.set(Object.values(fields)[0] ?? message);
    }
  }
}
