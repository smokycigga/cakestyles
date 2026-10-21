import { useEffect, useState } from "react";
import { Check, CircleUserRound, Clock3, Pencil, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  inputCls,
  Modal,
  PageHeader,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "../../components/admin/ui";

const EMPTY_TASK = {
  title: "",
  description: "",
  assignedTo: "",
  dueAt: "",
  type: "general",
  priority: "medium",
  status: "pending",
};

const PRIORITY_META = {
  low: { label: "Low", color: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", color: "bg-amber-100 text-amber-700" },
  high: { label: "High", color: "bg-rose-100 text-rose-700" },
  urgent: { label: "Urgent", color: "bg-rose-600 text-white" },
};

const STATUS_META = {
  pending: { label: "Pending", color: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In progress", color: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-500" },
};

const taskList = (data) => (Array.isArray(data) ? data : data?.tasks || []);
const userId = (value) => (typeof value === "string" ? value : value?._id);

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ queue: "", assignment: "all", status: "pending", priority: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState("");

  const load = () => {
    const params = {
      ...(filters.queue ? { queue: filters.queue } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.assignment === "mine" && user?._id ? { assignedTo: user._id } : {}),
    };
    api.get("/tasks", { params })
      .then(({ data }) => setTasks(taskList(data)))
      .catch((err) => {
        setTasks([]);
        toast.error(errMsg(err));
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    api.get("/users/assignable")
      .then(({ data }) => setUsers((data.users || data || []).filter((item) => item.active !== false)))
      .catch(() => setUsers([]));
  }, []);

  const teamMembers = user && !users.some((item) => item._id === user._id) ? [user, ...users] : users;

  const visibleTasks = (tasks || []).filter((task) => {
    const assignedId = userId(task.assignedTo || task.assignee);
    if (filters.assignment === "mine" && assignedId !== user?._id) return false;
    if (filters.status && task.status !== filters.status) return false;
    return !filters.priority || task.priority === filters.priority;
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_TASK, assignedTo: user?._id || "" });
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setEditId(task._id);
    setForm({
      title: task.title || "",
      description: task.description || "",
      assignedTo: userId(task.assignedTo || task.assignee) || "",
      dueAt: task.dueAt ? String(task.dueAt).slice(0, 16) : "",
      type: task.type || "general",
      priority: task.priority || "medium",
      status: task.status || "pending",
    });
    setModalOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      assignedTo: form.assignedTo,
      dueAt: form.dueAt,
      type: form.type,
      priority: form.priority,
      status: form.status,
    };
    try {
      if (editId) await api.put(`/tasks/${editId}`, body);
      else await api.post("/tasks", body);
      toast.success(editId ? "Task updated" : "Task created");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const complete = async (id) => {
    setCompletingId(id);
    try {
      await api.post(`/tasks/${id}/complete`);
      toast.success("Task completed");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setCompletingId("");
    }
  };

  const assigneeName = (task) => {
    const assigned = task.assignedTo || task.assignee;
    if (assigned?.name) return assigned.name;
    return teamMembers.find((item) => item._id === assigned)?.name || "Unassigned";
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Keep customer follow-ups and team work moving"
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> New Task</Button>}
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className="inline-flex self-start rounded-xl border border-wine-100 bg-white p-1">
          {[{ value: "", label: "All" }, { value: "overdue", label: "Overdue" }, { value: "today", label: "Today" }, { value: "upcoming", label: "Upcoming" }].map((queue) => (
            <button
              key={queue.value}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, queue: queue.value }))}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filters.queue === queue.value ? "bg-wine-700 text-white" : "text-cocoa-500 hover:bg-wine-50"}`}
            >
              {queue.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex lg:ml-auto">
          <select value={filters.assignment} onChange={(event) => setFilters((current) => ({ ...current, assignment: event.target.value }))} className={inputCls} aria-label="Filter by assignment">
            <option value="all">Everyone</option>
            <option value="mine">Assigned to me</option>
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className={inputCls} aria-label="Filter by status">
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))} className={inputCls} aria-label="Filter by priority">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </div>
      </div>

      {!tasks ? (
        <Spinner />
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-2xl border border-wine-100 bg-white">
          <EmptyState icon="✓" title="Nothing in this queue" hint="Adjust the filters or add a task for the team." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Task</Th>
              <Th>Assigned to</Th>
              <Th>Due</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((task) => {
              const isDone = task.status === "completed";
              const overdue = !isDone && task.dueAt && new Date(task.dueAt) < new Date();
              return (
                <tr key={task._id} className="hover:bg-wine-50/50">
                  <Td className="min-w-64" label="Task">
                    <div className={`font-medium ${isDone ? "text-cocoa-400 line-through" : "text-cocoa-800"}`}>{task.title}</div>
                    {task.description && <div className="mt-0.5 max-w-lg truncate text-xs text-cocoa-400">{task.description}</div>}
                  </Td>
                  <Td label="Assigned to">
                    <div className="flex items-center gap-2 whitespace-nowrap text-sm text-cocoa-600">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-wine-50 text-wine-600"><CircleUserRound className="h-4 w-4" /></span>
                      {assigneeName(task)}
                    </div>
                  </Td>
                  <Td className={`whitespace-nowrap text-xs ${overdue ? "font-semibold text-rose-700" : "text-cocoa-400"}`} label="Due">
                    {task.dueAt ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{fmtDate(task.dueAt)}{overdue ? " · overdue" : ""}</span> : "No due date"}
                  </Td>
                  <Td label="Priority"><Badge className={PRIORITY_META[task.priority]?.color || PRIORITY_META.medium.color}>{PRIORITY_META[task.priority]?.label || task.priority}</Badge></Td>
                  <Td label="Status"><Badge className={STATUS_META[task.status]?.color || "bg-slate-100 text-slate-600"}>{STATUS_META[task.status]?.label || task.status}</Badge></Td>
                  <Td label="Actions">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => openEdit(task)} className="rounded-lg p-2 text-cocoa-400 hover:bg-wine-50 hover:text-wine-700" aria-label={`Edit ${task.title}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!isDone && (
                        <button type="button" disabled={completingId === task._id} onClick={() => complete(task._id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                          <Check className="h-4 w-4" /> Complete
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editId ? "Edit task" : "Create task"}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Task *">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputCls} maxLength={160} required autoFocus />
          </Field>
          <Field label="Details">
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputCls} rows={3} maxLength={1000} placeholder="Add the next step or useful context" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to *">
              <select value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} className={inputCls} required>
                <option value="">Choose a team member</option>
                {teamMembers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Due *">
              <input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className={inputCls} required />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputCls}>
                <option value="general">General</option>
                <option value="follow_up">Follow-up</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="order">Order</option>
                <option value="customer">Customer</option>
              </select>
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={inputCls}>
                {Object.entries(PRIORITY_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputCls}>
                {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
            </Field>
          </div>
          <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : editId ? "Save Task" : "Create Task"}</Button>
        </form>
      </Modal>
    </div>
  );
}
