import React, { useState, useEffect, useRef } from "react";
import {
    Plus,
    Trash2,
    CheckCircle2,
    Circle,
    Calendar,
    Layout,
    X,
    Sun,
    Moon,
    Download,
    Upload,
    ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Utility ---
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- Types ---
type TaskScope = "simple" | "weekly";
type TimePeriod = "AM" | "PM";
type CategoryColorToken =
    | "blue"
    | "orange"
    | "red"
    | "gray"
    | "green"
    | "purple"
    | "teal"
    | "amber";

interface TimeParts {
    hour: string;
    minute: string;
    period: TimePeriod;
}

// --- Time Utility ---
function timeToMinutes(time?: string) {
    if (!time) return 0;
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function timeToParts(time?: string): TimeParts {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        return { hour: "09", minute: "00", period: "AM" };
    }

    const [hour24, minute] = time.split(":").map(Number);
    const period: TimePeriod = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

    return {
        hour: String(hour12).padStart(2, "0"),
        minute: String(minute).padStart(2, "0"),
        period,
    };
}

function partsToTime(parts: TimeParts): string {
    let hour24 = Number(parts.hour) % 12;
    if (parts.period === "PM") {
        hour24 += 12;
    }
    if (parts.period === "AM" && Number(parts.hour) === 12) {
        hour24 = 0;
    }

    return `${String(hour24).padStart(2, "0")}:${parts.minute}`;
}

interface Task {
    id: string;
    text: string;
    categoryId: string;
    completed: boolean;
    createdAt: number;
    day: number | null; // 0=Sunday, ..., 6=Saturday, null for general tasks
    startTime?: string; // "HH:MM"
    endTime?: string; // "HH:MM"
    profileId?: string;
}

interface CategoryDef {
    id: string;
    name: string;
    colorToken: CategoryColorToken;
    iconToken: string;
    isBuiltIn: boolean;
    createdAt: number;
    updatedAt: number;
}

interface Profile {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}

interface StoragePayloadV3 {
    version: 3;
    activeProfileId: string;
    profiles: Profile[];
    categories: CategoryDef[];
    tasks: Task[];
}

type ExportScope = "all" | "profile";
type ImportMode =
    | "merge_current_profile"
    | "replace_current_profile"
    | "create_new_profile"
    | "replace_everything";

interface ProfileExportPayload {
    version: number;
    scope: "profile";
    exportedAt: string;
    profile: Profile;
    tasks: Task[];
    categories: CategoryDef[];
}

interface FullExportPayload {
    version: number;
    scope: "all";
    exportedAt: string;
    tasks: Task[];
    profiles: Profile[];
    categories: CategoryDef[];
    activeProfileId: string;
}

type ImportRawPayload =
    | ProfileExportPayload
    | FullExportPayload
    | StoragePayloadV3
    | { tasks?: unknown; [key: string]: unknown }
    | unknown[];

interface ImportBundle {
    scope: ExportScope | "legacy";
    tasks: Task[];
    profiles: Profile[] | null;
    categories: CategoryDef[] | null;
    activeProfileId: string | null;
    profile: Profile | null;
}

interface ImportImpactSummary {
    mode: ImportMode;
    tasksToImport: number;
    tasksAdded: number;
    tasksRemoved: number;
    profilesAdded: number;
    profilesRemoved: number;
    categoriesAdded: number;
    categoriesMapped: number;
    notes: string[];
}

interface ImportEngineResult {
    ok: boolean;
    error?: string;
    warning?: string;
    warnings?: string[];
    nextTasks?: Task[];
    nextProfiles?: Profile[];
    nextCategories?: CategoryDef[];
    nextActiveProfileId?: string;
    nextSelectedCategoryId?: string;
    nextDailyCategoryId?: string;
    nextGeneralEditCategoryId?: string;
    nextActiveFilter?: string;
    impact?: ImportImpactSummary;
}

interface CandidateValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    estimatedBytes: number;
}

interface InfoModalState {
    title: string;
    message: string;
}

type ConfirmDialogAction =
    | { type: "delete_task"; taskId: string }
    | { type: "reset_progress"; scope: TaskScope };

interface ConfirmDialogState {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    tone: "danger" | "primary";
    action: ConfirmDialogAction;
}

type ProfileModalMode = "create" | "duplicate" | "rename";

interface ProfileModalState {
    mode: ProfileModalMode;
    title: string;
    submitLabel: string;
    defaultValue: string;
}

// --- Constants ---
// Updated categories and colors as per requirements
// Ensure box-sizing is border-box for all elements
document.documentElement.style.boxSizing = "border-box";

const CATEGORY_COLOR_STYLES: Record<
    CategoryColorToken,
    { colorClass: string; borderClass: string }
> = {
    blue: {
        colorClass:
            "text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/10",
        borderClass: "border-blue-500",
    },
    orange: {
        colorClass:
            "text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-400/10",
        borderClass: "border-orange-500",
    },
    red: {
        colorClass:
            "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-400/10",
        borderClass: "border-red-500",
    },
    gray: {
        colorClass:
            "text-gray-700 dark:text-gray-400 bg-gray-200 dark:bg-gray-400/10",
        borderClass: "border-gray-500",
    },
    green: {
        colorClass:
            "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-400/10",
        borderClass: "border-green-500",
    },
    purple: {
        colorClass:
            "text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-400/10",
        borderClass: "border-purple-500",
    },
    teal: {
        colorClass:
            "text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-400/10",
        borderClass: "border-teal-500",
    },
    amber: {
        colorClass:
            "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10",
        borderClass: "border-amber-500",
    },
};

const CATEGORY_ICON_OPTIONS = [
    "📌",
    "💼",
    "☕",
    "🏋️",
    "🗂️",
    "📚",
    "🎯",
    "🛒",
    "🧠",
    "💡",
    "🧑‍💻",
    "✍️",
    "🧘",
    "🎵",
    "🏠",
    "🧪",
] as const;

const BUILTIN_CATEGORY_IDS = {
    task: "cat_task",
    regime: "cat_regime",
    fitness: "cat_fitness",
    others: "cat_others",
} as const;

const LEGACY_CATEGORY_LABEL_TO_ID: Record<string, string> = {
    task: BUILTIN_CATEGORY_IDS.task,
    regime: BUILTIN_CATEGORY_IDS.regime,
    fitness: BUILTIN_CATEGORY_IDS.fitness,
    others: BUILTIN_CATEGORY_IDS.others,
    coron: BUILTIN_CATEGORY_IDS.task,
};

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
    String(index).padStart(2, "0"),
);
const PERIOD_OPTIONS: TimePeriod[] = ["AM", "PM"];
const TASKS_STORAGE_KEY = "life-sync-tasks-v1";
const MAX_IMPORT_FILE_SIZE_BYTES = 1024 * 1024;
const STORAGE_VERSION = 3;
const DEFAULT_PROFILE_ID = "default";
const DEFAULT_PROFILE_NAME = "Default";
const MAX_PROFILES = 10;
const MAX_CATEGORIES = 15;
const MAX_WEEKLY_TASKS_PER_PROFILE = 50;
const MAX_PROFILE_NAME_LENGTH = 40;
const MAX_CATEGORY_NAME_LENGTH = 30;
const MAX_TASK_TEXT_LENGTH = 240;
const MAX_STORAGE_WARN_LIMIT_BYTES = 3.5 * 1024 * 1024;
const MAX_STORAGE_HARD_LIMIT_BYTES = 4.5 * 1024 * 1024;
const IMPORT_DEFAULT_PROFILE_BASE_NAME = "Imported Profile";

const CATEGORY_COLOR_OPTIONS = Object.keys(
    CATEGORY_COLOR_STYLES,
) as CategoryColorToken[];

const getCategoryColorStyle = (token: CategoryColorToken) =>
    CATEGORY_COLOR_STYLES[token] ?? CATEGORY_COLOR_STYLES.blue;

const normalizeCategoryName = (value: string) =>
    value.trim().replace(/\s+/g, " ");

const normalizeCategoryColorToken = (
    value: unknown,
): CategoryColorToken => {
    if (typeof value !== "string") return "blue";
    return CATEGORY_COLOR_OPTIONS.includes(value as CategoryColorToken)
        ? (value as CategoryColorToken)
        : "blue";
};

const normalizeCategoryIconToken = (value: unknown) => {
    if (typeof value !== "string") return "📌";
    return CATEGORY_ICON_OPTIONS.includes(value as (typeof CATEGORY_ICON_OPTIONS)[number])
        ? value
        : "📌";
};

const createBuiltInCategories = (timestamp = Date.now()): CategoryDef[] => [
    {
        id: BUILTIN_CATEGORY_IDS.task,
        name: "Task",
        colorToken: "blue",
        iconToken: "💼",
        isBuiltIn: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    },
    {
        id: BUILTIN_CATEGORY_IDS.regime,
        name: "Regime",
        colorToken: "orange",
        iconToken: "☕",
        isBuiltIn: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    },
    {
        id: BUILTIN_CATEGORY_IDS.fitness,
        name: "Fitness",
        colorToken: "red",
        iconToken: "🏋️",
        isBuiltIn: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    },
    {
        id: BUILTIN_CATEGORY_IDS.others,
        name: "Others",
        colorToken: "gray",
        iconToken: "🗂️",
        isBuiltIn: true,
        createdAt: timestamp,
        updatedAt: timestamp,
    },
];

const ensureBuiltInCategories = (input: CategoryDef[]): CategoryDef[] => {
    const builtIns = createBuiltInCategories(0);
    const builtInIds = new Set(builtIns.map((category) => category.id));
    const custom = input
        .filter(
            (category) =>
                !category.isBuiltIn && !builtInIds.has(category.id),
        )
        .filter(
            (category, index, list) =>
                list.findIndex((candidate) => candidate.id === category.id) ===
                index,
        );

    return [...builtIns, ...custom].slice(0, MAX_CATEGORIES);
};

const normalizeProfileName = (value: string) =>
    value.trim().replace(/\s+/g, " ");

const createDefaultProfile = (timestamp = Date.now()): Profile => ({
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    createdAt: timestamp,
    updatedAt: timestamp,
});

const buildStoragePayload = (
    tasks: Task[],
    profiles: Profile[],
    categories: CategoryDef[],
    activeProfileId: string,
): StoragePayloadV3 => ({
    version: STORAGE_VERSION,
    activeProfileId,
    profiles,
    categories,
    tasks,
});

const sortTasksByCreatedAtDesc = (taskList: Task[]) =>
    [...taskList].sort((a, b) => b.createdAt - a.createdAt);

const estimateStorageBytes = (payload: StoragePayloadV3) =>
    new Blob([JSON.stringify(payload)]).size;

function App() {
    // --- State ---
    const [tasks, setTasks] = useState<Task[]>([]);
    const [categories, setCategories] = useState<CategoryDef[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [activeProfileId, setActiveProfileId] =
        useState<string>(DEFAULT_PROFILE_ID);
    const [inputText, setInputText] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] =
        useState<string>(BUILTIN_CATEGORY_IDS.task);
    const [activeFilter, setActiveFilter] = useState<string>("All");
    const [loading, setLoading] = useState(true);
    const [isDark, setIsDark] = useState(() => {
        if (typeof window !== "undefined") {
            const savedTheme = localStorage.getItem("theme");
            if (savedTheme) return savedTheme === "dark";
            return window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
        return true;
    });

    // Tab state: 0 = Simple Tasks, 1 = Weekly Schedule
    const [activeTab, setActiveTab] = useState<number>(0);
    // For daily view: which day is selected (0=Sunday, 1=Monday, ..., 6=Saturday)
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    // Daily view form state
    const [dailyTaskText, setDailyTaskText] = useState("");
    const [dailyCategoryId, setDailyCategoryId] =
        useState<string>(BUILTIN_CATEGORY_IDS.task);
    const [dailyStartParts, setDailyStartParts] = useState<TimeParts>(() =>
        timeToParts("09:00"),
    );
    const [dailyEndParts, setDailyEndParts] = useState<TimeParts>(() =>
        timeToParts("10:00"),
    );
    // Editing state for daily view
    const [editingDailyTaskId, setEditingDailyTaskId] = useState<string | null>(
        null,
    );

    // General task edit state
    const [editingGeneralTaskId, setEditingGeneralTaskId] = useState<
        string | null
    >(null);
    const [generalEditText, setGeneralEditText] = useState("");
    const [generalEditCategoryId, setGeneralEditCategoryId] =
        useState<string>(BUILTIN_CATEGORY_IDS.task);
    const [pendingImportBundle, setPendingImportBundle] =
        useState<ImportBundle | null>(null);
    const [importSelectedMode, setImportSelectedMode] =
        useState<ImportMode>("merge_current_profile");
    const [importStep, setImportStep] = useState<"select_mode" | "preview">(
        "select_mode",
    );
    const [importPreviewResult, setImportPreviewResult] =
        useState<ImportEngineResult | null>(null);
    const [importModalError, setImportModalError] = useState<string | null>(
        null,
    );
    const [importModalWarning, setImportModalWarning] = useState<string | null>(
        null,
    );
    const [importCreateProfileName, setImportCreateProfileName] =
        useState("");
    const [showDeleteOptions, setShowDeleteOptions] = useState(false);
    const [deleteScope, setDeleteScope] = useState<TaskScope>("simple");
    const [infoModal, setInfoModal] = useState<InfoModalState | null>(null);
    const [confirmDialog, setConfirmDialog] =
        useState<ConfirmDialogState | null>(null);
    const [profileModal, setProfileModal] = useState<ProfileModalState | null>(
        null,
    );
    const [profileModalInput, setProfileModalInput] = useState("");
    const [dailyTimeError, setDailyTimeError] = useState<string | null>(null);
    const [showProfileDeleteConfirm, setShowProfileDeleteConfirm] =
        useState(false);
    const [profileDeleteTargetId, setProfileDeleteTargetId] = useState<
        string | null
    >(null);
    const [showProfileLimitModal, setShowProfileLimitModal] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryColorToken, setNewCategoryColorToken] =
        useState<CategoryColorToken>("blue");
    const [newCategoryIconToken, setNewCategoryIconToken] = useState("📌");
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
        null,
    );
    const [editingCategoryName, setEditingCategoryName] = useState("");
    const [editingCategoryColorToken, setEditingCategoryColorToken] =
        useState<CategoryColorToken>("blue");
    const [editingCategoryIconToken, setEditingCategoryIconToken] =
        useState("📌");
    const [showCategoryDeleteConfirm, setShowCategoryDeleteConfirm] =
        useState(false);
    const [categoryDeleteTargetId, setCategoryDeleteTargetId] = useState<
        string | null
    >(null);
    const [categoryDeleteReassignId, setCategoryDeleteReassignId] =
        useState<string>(BUILTIN_CATEGORY_IDS.task);
    const [isDailyCategoryOpen, setIsDailyCategoryOpen] = useState(false);
    const [storageNotice, setStorageNotice] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dailyCategoryMenuRef = useRef<HTMLDivElement | null>(null);

    // --- Effects ---
    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            root.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
    }, [isDark]);

    useEffect(() => {
        try {
            const rawTasks = localStorage.getItem(TASKS_STORAGE_KEY);
            const defaultProfile = createDefaultProfile();
            const defaultCategories = createBuiltInCategories();

            if (!rawTasks) {
                setTasks([]);
                setProfiles([defaultProfile]);
                setCategories(defaultCategories);
                setActiveProfileId(defaultProfile.id);
                setSelectedCategoryId(BUILTIN_CATEGORY_IDS.task);
                setDailyCategoryId(BUILTIN_CATEGORY_IDS.task);
                return;
            }

            const parsed = JSON.parse(rawTasks);

            if (Array.isArray(parsed)) {
                const migratedTasks = sortTasksByCreatedAtDesc(
                    parsed
                        .map((entry) => normalizeImportedTask(entry))
                        .filter((task): task is Task => task !== null)
                        .map((task) => ({
                            ...task,
                            profileId: defaultProfile.id,
                            categoryId: task.categoryId,
                        })),
                );

                const migratedPayload = buildStoragePayload(
                    migratedTasks,
                    [defaultProfile],
                    defaultCategories,
                    defaultProfile.id,
                );

                localStorage.setItem(
                    TASKS_STORAGE_KEY,
                    JSON.stringify(migratedPayload),
                );
                setTasks(migratedPayload.tasks);
                setProfiles(migratedPayload.profiles);
                setCategories(migratedPayload.categories);
                setActiveProfileId(migratedPayload.activeProfileId);
                setSelectedCategoryId(BUILTIN_CATEGORY_IDS.task);
                setDailyCategoryId(BUILTIN_CATEGORY_IDS.task);
                return;
            }

            if (parsed && typeof parsed === "object") {
                const payload = parsed as {
                    version?: unknown;
                    tasks?: unknown;
                    profiles?: unknown;
                    categories?: unknown;
                    activeProfileId?: unknown;
                };

                const loadedProfiles = Array.isArray(payload.profiles)
                    ? payload.profiles
                          .map((entry) => {
                              if (!entry || typeof entry !== "object")
                                  return null;
                              const candidate = entry as Partial<Profile>;
                              if (
                                  typeof candidate.id !== "string" ||
                                  !candidate.id.trim() ||
                                  typeof candidate.name !== "string"
                              ) {
                                  return null;
                              }

                              const now = Date.now();
                              return {
                                  id: candidate.id.trim(),
                                  name:
                                      normalizeProfileName(candidate.name) ||
                                      DEFAULT_PROFILE_NAME,
                                  createdAt:
                                      typeof candidate.createdAt === "number" &&
                                      Number.isFinite(candidate.createdAt)
                                          ? candidate.createdAt
                                          : now,
                                  updatedAt:
                                      typeof candidate.updatedAt === "number" &&
                                      Number.isFinite(candidate.updatedAt)
                                          ? candidate.updatedAt
                                          : now,
                              } satisfies Profile;
                          })
                          .filter(
                              (profile): profile is Profile => profile !== null,
                          )
                          .slice(0, MAX_PROFILES)
                    : [];

                const safeProfiles =
                    loadedProfiles.length > 0
                        ? loadedProfiles
                        : [defaultProfile];

                const loadedCategories = Array.isArray(payload.categories)
                    ? payload.categories
                          .map((entry) => {
                              if (!entry || typeof entry !== "object") {
                                  return null;
                              }
                              const candidate = entry as Partial<CategoryDef>;
                              if (
                                  typeof candidate.id !== "string" ||
                                  !candidate.id.trim() ||
                                  typeof candidate.name !== "string"
                              ) {
                                  return null;
                              }

                              const normalizedName = normalizeCategoryName(
                                  candidate.name,
                              );
                              if (!normalizedName) {
                                  return null;
                              }

                              const now = Date.now();
                              return {
                                  id: candidate.id.trim(),
                                  name: normalizedName,
                                  colorToken: normalizeCategoryColorToken(
                                      candidate.colorToken,
                                  ),
                                  iconToken: normalizeCategoryIconToken(
                                      candidate.iconToken,
                                  ),
                                  isBuiltIn: Boolean(candidate.isBuiltIn),
                                  createdAt:
                                      typeof candidate.createdAt ===
                                          "number" &&
                                      Number.isFinite(candidate.createdAt)
                                          ? candidate.createdAt
                                          : now,
                                  updatedAt:
                                      typeof candidate.updatedAt ===
                                          "number" &&
                                      Number.isFinite(candidate.updatedAt)
                                          ? candidate.updatedAt
                                          : now,
                              } satisfies CategoryDef;
                          })
                          .filter(
                              (category): category is CategoryDef =>
                                  category !== null,
                          )
                    : [];

                const safeCategories = ensureBuiltInCategories(
                    loadedCategories.length > 0
                        ? loadedCategories
                        : defaultCategories,
                );
                const safeCategoryIds = new Set(
                    safeCategories.map((category) => category.id),
                );

                const safeProfileIds = new Set(
                    safeProfiles.map((profile) => profile.id),
                );
                const fallbackProfileId = safeProfiles[0].id;

                const loadedTasks = Array.isArray(payload.tasks)
                    ? payload.tasks
                          .map((entry) => normalizeImportedTask(entry))
                          .filter((task): task is Task => task !== null)
                          .map((task) => {
                              const normalizedProfileId =
                                  task.profileId &&
                                  safeProfileIds.has(task.profileId)
                                      ? task.profileId
                                      : fallbackProfileId;

                              const normalizedCategoryId =
                                  task.categoryId &&
                                  safeCategoryIds.has(task.categoryId)
                                      ? task.categoryId
                                      : BUILTIN_CATEGORY_IDS.task;

                              return {
                                  ...task,
                                  profileId: normalizedProfileId,
                                  categoryId: normalizedCategoryId,
                              };
                          })
                    : [];

                const parsedActiveProfileId =
                    typeof payload.activeProfileId === "string"
                        ? payload.activeProfileId
                        : fallbackProfileId;

                const safeActiveProfileId = safeProfileIds.has(
                    parsedActiveProfileId,
                )
                    ? parsedActiveProfileId
                    : fallbackProfileId;

                const normalizedPayload = buildStoragePayload(
                    sortTasksByCreatedAtDesc(loadedTasks),
                    safeProfiles,
                    safeCategories,
                    safeActiveProfileId,
                );

                if (payload.version !== STORAGE_VERSION) {
                    localStorage.setItem(
                        TASKS_STORAGE_KEY,
                        JSON.stringify(normalizedPayload),
                    );
                }

                setTasks(normalizedPayload.tasks);
                setProfiles(normalizedPayload.profiles);
                setCategories(normalizedPayload.categories);
                setActiveProfileId(normalizedPayload.activeProfileId);
                setSelectedCategoryId(BUILTIN_CATEGORY_IDS.task);
                setDailyCategoryId(BUILTIN_CATEGORY_IDS.task);
            }
        } catch (err) {
            console.error("Failed to load tasks from local storage", err);
            const defaultProfile = createDefaultProfile();
            const defaultCategories = createBuiltInCategories();
            setTasks([]);
            setProfiles([defaultProfile]);
            setCategories(defaultCategories);
            setActiveProfileId(defaultProfile.id);
            setSelectedCategoryId(BUILTIN_CATEGORY_IDS.task);
            setDailyCategoryId(BUILTIN_CATEGORY_IDS.task);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (loading) return;
        const timeoutId = setTimeout(() => {
            try {
                const payload = buildStoragePayload(
                    tasks,
                    profiles,
                    categories,
                    activeProfileId,
                );
                const estimatedBytes = estimateStorageBytes(payload);

                if (estimatedBytes > MAX_STORAGE_WARN_LIMIT_BYTES) {
                    setStorageNotice(
                        `Storage usage is high (${Math.ceil(estimatedBytes / 1024)} KB). Consider cleaning old data.`,
                    );
                } else {
                    setStorageNotice(null);
                }

                localStorage.setItem(
                    TASKS_STORAGE_KEY,
                    JSON.stringify(payload),
                );
            } catch (err) {
                console.error("Failed to save tasks to local storage", err);
                setStorageNotice(
                    "Could not save updates. Storage may be full. Please export and clean up old data.",
                );
            }
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [tasks, profiles, categories, activeProfileId, loading]);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            const targetNode = event.target as Node;
            if (
                dailyCategoryMenuRef.current &&
                !dailyCategoryMenuRef.current.contains(targetNode)
            ) {
                setIsDailyCategoryOpen(false);
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, []);

    const dailyStartTime = partsToTime(dailyStartParts);
    const dailyEndTime = partsToTime(dailyEndParts);

    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const getCategoryById = (categoryId: string) =>
        categoryMap.get(categoryId) ??
        categoryMap.get(BUILTIN_CATEGORY_IDS.task) ?? {
            id: BUILTIN_CATEGORY_IDS.task,
            name: "Task",
            colorToken: "blue" as CategoryColorToken,
            iconToken: "📌",
            isBuiltIn: true,
            createdAt: 0,
            updatedAt: 0,
        };

    const normalizeTaskProfileId = (task: Task) =>
        task.profileId?.trim() || DEFAULT_PROFILE_ID;

    const normalizeTaskCategoryId = (task: Task) => {
        if (typeof task.categoryId === "string" && task.categoryId.trim()) {
            return task.categoryId.trim();
        }
        return BUILTIN_CATEGORY_IDS.task;
    };

    const getValidatedTaskText = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        if (trimmed.length > MAX_TASK_TEXT_LENGTH) {
            setInfoModal({
                title: "Task too long",
                message: `Task description is too long. Maximum is ${MAX_TASK_TEXT_LENGTH} characters.`,
            });
            return null;
        }
        return trimmed;
    };

    const validateImportCandidate = (
        nextTasks: Task[],
        nextProfiles: Profile[],
        nextCategories: CategoryDef[],
        nextActiveProfileId: string,
    ): CandidateValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (nextProfiles.length > MAX_PROFILES) {
            errors.push(`Maximum number of profiles is ${MAX_PROFILES}.`);
        }

        if (nextCategories.length > MAX_CATEGORIES) {
            errors.push(`Maximum number of categories is ${MAX_CATEGORIES}.`);
        }

        const categoryIds = new Set(nextCategories.map((category) => category.id));

        for (const category of nextCategories) {
            if (!normalizeCategoryName(category.name)) {
                errors.push("Category name cannot be empty.");
            }
            if (category.name.length > MAX_CATEGORY_NAME_LENGTH) {
                errors.push(
                    `Category names must be ${MAX_CATEGORY_NAME_LENGTH} characters or less.`,
                );
            }
        }

        const weeklyByProfile = new Map<string, number>();
        for (const task of nextTasks) {
            if (!categoryIds.has(normalizeTaskCategoryId(task))) {
                errors.push("A task references an invalid category.");
            }
            if (task.day === null) continue;
            const profileId = normalizeTaskProfileId(task);
            const nextCount = (weeklyByProfile.get(profileId) ?? 0) + 1;
            weeklyByProfile.set(profileId, nextCount);

            if (nextCount > MAX_WEEKLY_TASKS_PER_PROFILE) {
                const profileName =
                    nextProfiles.find((profile) => profile.id === profileId)
                        ?.name ?? "This profile";
                errors.push(
                    `${profileName} reached the weekly task limit (${MAX_WEEKLY_TASKS_PER_PROFILE}).`,
                );
            }
        }

        const payload = buildStoragePayload(
            nextTasks,
            nextProfiles,
            nextCategories,
            nextActiveProfileId,
        );
        const estimatedBytes = estimateStorageBytes(payload);

        if (estimatedBytes > MAX_STORAGE_HARD_LIMIT_BYTES) {
            errors.push(
                "Storage limit reached. Please export your data and remove older tasks/profiles before adding more.",
            );
        }

        if (estimatedBytes > MAX_STORAGE_WARN_LIMIT_BYTES) {
            warnings.push(
                `Storage usage is high (${Math.ceil(estimatedBytes / 1024)} KB). Consider cleaning old data.`,
            );
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            estimatedBytes,
        };
    };

    const isTaskInScope = (task: Task, scope: TaskScope) => {
        return scope === "simple"
            ? task.day === null
            : task.day !== null &&
                  normalizeTaskProfileId(task) === activeProfileId;
    };

    const updateTimePart = (
        setter: React.Dispatch<React.SetStateAction<TimeParts>>,
        key: keyof TimeParts,
        value: string,
    ) => {
        setter((prev) => ({
            ...prev,
            [key]: value as TimeParts[typeof key],
        }));
    };

    const normalizeImportedTask = (rawTask: unknown): Task | null => {
        if (!rawTask || typeof rawTask !== "object") return null;

        const source = rawTask as Partial<Task> & Record<string, unknown>;
        const text = typeof source.text === "string" ? source.text.trim() : "";
        if (!text) return null;

        const sourceCategoryId =
            typeof source.categoryId === "string" ? source.categoryId.trim() : "";
        const sourceCategoryLabel =
            typeof source.category === "string"
                ? source.category.trim().toLowerCase()
                : "";
        const mappedCategoryId =
            sourceCategoryId ||
            LEGACY_CATEGORY_LABEL_TO_ID[sourceCategoryLabel] ||
            BUILTIN_CATEGORY_IDS.task;

        const day =
            typeof source.day === "number" && source.day >= 0 && source.day <= 6
                ? Math.floor(source.day)
                : null;

        const startTime =
            typeof source.startTime === "string" ? source.startTime : undefined;
        const endTime =
            typeof source.endTime === "string" ? source.endTime : undefined;
        const profileId =
            typeof source.profileId === "string" && source.profileId.trim()
                ? source.profileId.trim()
                : DEFAULT_PROFILE_ID;

        return {
            id:
                typeof source.id === "string" && source.id.trim()
                    ? source.id
                    : crypto.randomUUID(),
            text,
            categoryId: mappedCategoryId,
            completed: Boolean(source.completed),
            createdAt:
                typeof source.createdAt === "number" &&
                Number.isFinite(source.createdAt)
                    ? source.createdAt
                    : Date.now(),
            day,
            startTime,
            endTime,
            profileId,
        };
    };

    const parseImportedCategories = (rawData: unknown): CategoryDef[] | null => {
        if (!rawData || typeof rawData !== "object") return null;
        const payload = rawData as { categories?: unknown };
        if (!Array.isArray(payload.categories)) return null;

        const now = Date.now();
        const normalized = payload.categories
            .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const source = entry as Partial<CategoryDef>;
                if (
                    typeof source.id !== "string" ||
                    !source.id.trim() ||
                    typeof source.name !== "string"
                ) {
                    return null;
                }

                const normalizedName = normalizeCategoryName(source.name);
                if (!normalizedName) return null;

                return {
                    id: source.id.trim(),
                    name: normalizedName,
                    colorToken: normalizeCategoryColorToken(source.colorToken),
                    iconToken: normalizeCategoryIconToken(source.iconToken),
                    isBuiltIn: Boolean(source.isBuiltIn),
                    createdAt:
                        typeof source.createdAt === "number" &&
                        Number.isFinite(source.createdAt)
                            ? source.createdAt
                            : now,
                    updatedAt:
                        typeof source.updatedAt === "number" &&
                        Number.isFinite(source.updatedAt)
                            ? source.updatedAt
                            : now,
                } satisfies CategoryDef;
            })
            .filter((category): category is CategoryDef => category !== null);

        if (normalized.length === 0) {
            return null;
        }

        return ensureBuiltInCategories(normalized).slice(0, MAX_CATEGORIES);
    };

    const parseImportedProfiles = (rawData: unknown): Profile[] | null => {
        if (!rawData || typeof rawData !== "object") return null;
        const payload = rawData as { profiles?: unknown };
        if (!Array.isArray(payload.profiles)) return null;

        const now = Date.now();
        const normalized = payload.profiles
            .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const source = entry as Partial<Profile>;
                if (
                    typeof source.id !== "string" ||
                    !source.id.trim() ||
                    typeof source.name !== "string"
                ) {
                    return null;
                }

                const normalizedName = normalizeProfileName(source.name);
                if (!normalizedName) return null;

                return {
                    id: source.id.trim(),
                    name: normalizedName,
                    createdAt:
                        typeof source.createdAt === "number" &&
                        Number.isFinite(source.createdAt)
                            ? source.createdAt
                            : now,
                    updatedAt:
                        typeof source.updatedAt === "number" &&
                        Number.isFinite(source.updatedAt)
                            ? source.updatedAt
                            : now,
                } satisfies Profile;
            })
            .filter((profile): profile is Profile => profile !== null);

        if (normalized.length === 0) {
            return null;
        }

        return normalized.slice(0, MAX_PROFILES);
    };

    const buildImportBundle = (rawData: ImportRawPayload): ImportBundle => {
        const scope =
            rawData &&
            typeof rawData === "object" &&
            !Array.isArray(rawData) &&
            (rawData as { scope?: unknown }).scope === "profile"
                ? "profile"
                : rawData &&
                    typeof rawData === "object" &&
                    !Array.isArray(rawData) &&
                    (rawData as { scope?: unknown }).scope === "all"
                  ? "all"
                  : "legacy";

        const parsedTasks = parseImportedTasks(rawData);
        const parsedProfiles = parseImportedProfiles(rawData);
        const parsedCategories = parseImportedCategories(rawData);

        const parsedActiveProfileId =
            rawData &&
            typeof rawData === "object" &&
            !Array.isArray(rawData) &&
            typeof (rawData as { activeProfileId?: unknown }).activeProfileId ===
                "string"
                ? ((rawData as { activeProfileId: string }).activeProfileId ??
                      null)
                : null;

        const parsedProfile =
            rawData &&
            typeof rawData === "object" &&
            !Array.isArray(rawData) &&
            (rawData as { profile?: unknown }).profile &&
            typeof (rawData as { profile?: unknown }).profile === "object"
                ? (() => {
                      const source = (rawData as { profile: Partial<Profile> })
                          .profile;
                      if (
                          typeof source.id !== "string" ||
                          !source.id.trim() ||
                          typeof source.name !== "string"
                      ) {
                          return null;
                      }

                      const now = Date.now();
                      return {
                          id: source.id.trim(),
                          name:
                              normalizeProfileName(source.name) ||
                              IMPORT_DEFAULT_PROFILE_BASE_NAME,
                          createdAt:
                              typeof source.createdAt === "number" &&
                              Number.isFinite(source.createdAt)
                                  ? source.createdAt
                                  : now,
                          updatedAt:
                              typeof source.updatedAt === "number" &&
                              Number.isFinite(source.updatedAt)
                                  ? source.updatedAt
                                  : now,
                      } satisfies Profile;
                  })()
                : null;

        return {
            scope,
            tasks: parsedTasks,
            profiles: parsedProfiles,
            categories: parsedCategories,
            activeProfileId: parsedActiveProfileId,
            profile: parsedProfile,
        };
    };

    const formatImportProfileFallbackName = () => {
        const stamp = format(new Date(), "yyyy-MM-dd HH:mm");
        return `${IMPORT_DEFAULT_PROFILE_BASE_NAME} (${stamp})`;
    };

    const getUniqueProfileName = (
        desiredName: string,
        existingProfiles: Profile[],
    ) => {
        const base =
            normalizeProfileName(desiredName) || formatImportProfileFallbackName();

        const existingNames = new Set(
            existingProfiles.map((profile) => profile.name.toLowerCase()),
        );
        if (!existingNames.has(base.toLowerCase())) {
            return base;
        }

        let suffix = 2;
        while (existingNames.has(`${base} -${suffix}`.toLowerCase())) {
            suffix += 1;
        }
        return `${base} -${suffix}`;
    };

    const buildCurrentProfileExportPayload = (): ProfileExportPayload => {
        const profile =
            profiles.find((entry) => entry.id === activeProfileId) ??
            createDefaultProfile();
        const profileTasks = tasks.filter(
            (task) =>
                task.day !== null && normalizeTaskProfileId(task) === profile.id,
        );
        const profileCategoryIds = new Set(
            profileTasks.map((task) => normalizeTaskCategoryId(task)),
        );

        const exportCategories = ensureBuiltInCategories(
            categories.filter(
                (category) =>
                    category.isBuiltIn || profileCategoryIds.has(category.id),
            ),
        );

        return {
            version: STORAGE_VERSION,
            scope: "profile",
            exportedAt: new Date().toISOString(),
            profile,
            tasks: profileTasks,
            categories: exportCategories,
        };
    };

    const buildAllExportPayload = (): FullExportPayload => ({
        version: STORAGE_VERSION,
        scope: "all",
        exportedAt: new Date().toISOString(),
        tasks,
        profiles,
        categories,
        activeProfileId,
    });

    const parseImportedTasks = (rawData: unknown): Task[] => {
        const taskPayload = Array.isArray(rawData)
            ? rawData
            : rawData &&
                typeof rawData === "object" &&
                Array.isArray((rawData as { tasks?: unknown }).tasks)
              ? (rawData as { tasks: unknown[] }).tasks
              : null;

        if (!taskPayload) {
            throw new Error("Invalid backup format.");
        }

        const normalized = taskPayload
            .map((entry) => normalizeImportedTask(entry))
            .filter((task): task is Task => task !== null);

        if (normalized.length === 0 && taskPayload.length > 0) {
            throw new Error("No valid tasks were found in that file.");
        }

        return normalized;
    };

    const activeProfile =
        profiles.find((profile) => profile.id === activeProfileId) ??
        profiles[0];

    const clearImportState = () => {
        setPendingImportBundle(null);
        setImportSelectedMode("merge_current_profile");
        setImportStep("select_mode");
        setImportPreviewResult(null);
        setImportModalError(null);
        setImportModalWarning(null);
        setImportCreateProfileName("");
    };

    const commitState = (
        nextTasks: Task[],
        nextProfiles: Profile[],
        nextCategories: CategoryDef[],
        nextActiveProfileId: string,
    ) => {
        if (
            !nextProfiles.some(
                (profile) => profile.id === nextActiveProfileId,
            ) &&
            nextProfiles.length > 0
        ) {
            setInfoModal({
                title: "Invalid profile",
                message: "The selected profile is invalid.",
            });
            return false;
        }

        const validation = validateImportCandidate(
            nextTasks,
            nextProfiles,
            nextCategories,
            nextActiveProfileId,
        );

        if (!validation.valid) {
            setInfoModal({
                title: "Cannot save changes",
                message: validation.errors[0] ?? "Validation failed.",
            });
            return false;
        }

        if (validation.warnings.length > 0) {
            setStorageNotice(validation.warnings[0]);
        }

        setStorageNotice(null);
        setTasks(sortTasksByCreatedAtDesc(nextTasks));
        setProfiles(nextProfiles);
        setCategories(nextCategories);
        setActiveProfileId(nextActiveProfileId);
        return true;
    };

    const upsertTasks = (updater: (prev: Task[]) => Task[]) => {
        const nextTasks = updater(tasks);
        commitState(nextTasks, profiles, categories, activeProfileId);
    };

    const preserveSimpleTasks = (current: Task[], candidate: Task[]): Task[] => {
        const simpleTasks = current.filter((task) => task.day === null);
        const nonSimpleCandidate = candidate.filter((task) => task.day !== null);

        const existingIds = new Set(simpleTasks.map((task) => task.id));
        const dedupedWeekly = nonSimpleCandidate.map((task) => {
            if (!existingIds.has(task.id)) {
                existingIds.add(task.id);
                return task;
            }

            let nextId = crypto.randomUUID();
            while (existingIds.has(nextId)) {
                nextId = crypto.randomUUID();
            }
            existingIds.add(nextId);
            return {
                ...task,
                id: nextId,
            };
        });

        return [...simpleTasks, ...dedupedWeekly];
    };

    const applyImportMode = (
        mode: ImportMode,
        bundle: ImportBundle,
        options?: { newProfileName?: string },
    ): ImportEngineResult => {
        const incomingCategories = ensureBuiltInCategories(
            bundle.categories ?? categories,
        );
        const incomingCategoryIds = new Set(
            incomingCategories.map((category) => category.id),
        );

        const incomingProfiles =
            bundle.profiles && bundle.profiles.length > 0
                ? bundle.profiles
                : [createDefaultProfile()];
        const incomingProfileIds = new Set(
            incomingProfiles.map((profile) => profile.id),
        );

        const importedTasks = bundle.tasks.map((task) => ({
            ...task,
            categoryId: incomingCategoryIds.has(normalizeTaskCategoryId(task))
                ? normalizeTaskCategoryId(task)
                : BUILTIN_CATEGORY_IDS.task,
            profileId: incomingProfileIds.has(normalizeTaskProfileId(task))
                ? normalizeTaskProfileId(task)
                : incomingProfiles[0].id,
        }));

        const applyCandidateValidation = (
            candidateTasks: Task[],
            candidateProfiles: Profile[],
            candidateCategories: CategoryDef[],
            candidateActiveProfileId: string,
            summary: ImportImpactSummary,
            baseWarnings: string[] = [],
        ): ImportEngineResult => {
            const validation = validateImportCandidate(
                candidateTasks,
                candidateProfiles,
                candidateCategories,
                candidateActiveProfileId,
            );

            const warnings = [...baseWarnings, ...validation.warnings];

            if (!validation.valid) {
                return {
                    ok: false,
                    error: validation.errors[0] ?? "Validation failed.",
                    warnings,
                    impact: summary,
                };
            }

            return {
                ok: true,
                nextTasks: candidateTasks,
                nextProfiles: candidateProfiles,
                nextCategories: candidateCategories,
                nextActiveProfileId: candidateActiveProfileId,
                ...normalizeSelections(
                    new Set(candidateCategories.map((category) => category.id)),
                ),
                warning: warnings[0],
                warnings,
                impact: summary,
            };
        };

        const summaryBase = {
            mode,
            tasksToImport: importedTasks.length,
            tasksAdded: 0,
            tasksRemoved: 0,
            profilesAdded: 0,
            profilesRemoved: 0,
            categoriesAdded: 0,
            categoriesMapped: 0,
            notes: [
                importedTasks.length === 0
                    ? "0 tasks will be imported."
                    : `${importedTasks.length} task${importedTasks.length === 1 ? "" : "s"} will be imported.`,
            ],
        } satisfies ImportImpactSummary;

        const normalizeSelections = (
            categoryIds: Set<string>,
        ): Pick<
            ImportEngineResult,
            | "nextSelectedCategoryId"
            | "nextDailyCategoryId"
            | "nextGeneralEditCategoryId"
            | "nextActiveFilter"
        > => ({
            nextSelectedCategoryId: categoryIds.has(selectedCategoryId)
                ? selectedCategoryId
                : BUILTIN_CATEGORY_IDS.task,
            nextDailyCategoryId: categoryIds.has(dailyCategoryId)
                ? dailyCategoryId
                : BUILTIN_CATEGORY_IDS.task,
            nextGeneralEditCategoryId: categoryIds.has(generalEditCategoryId)
                ? generalEditCategoryId
                : BUILTIN_CATEGORY_IDS.task,
            nextActiveFilter:
                activeFilter === "All" || categoryIds.has(activeFilter)
                    ? activeFilter
                    : "All",
        });

        if (mode === "replace_everything") {
            const profilesForReplace = incomingProfiles;
            const profileIds = new Set(
                profilesForReplace.map((profile) => profile.id),
            );
            const fallbackProfileId = profilesForReplace[0].id;
            const nextTasks = importedTasks.map((task) => ({
                ...task,
                profileId: profileIds.has(normalizeTaskProfileId(task))
                    ? normalizeTaskProfileId(task)
                    : fallbackProfileId,
            }));

            const nextActiveProfileId =
                bundle.activeProfileId && profileIds.has(bundle.activeProfileId)
                    ? bundle.activeProfileId
                    : fallbackProfileId;

            const summary = {
                ...summaryBase,
                tasksAdded: nextTasks.length,
                tasksRemoved: tasks.length,
                profilesAdded: Math.max(
                    0,
                    profilesForReplace.length - profiles.length,
                ),
                profilesRemoved: Math.max(
                    0,
                    profiles.length - profilesForReplace.length,
                ),
                categoriesAdded: Math.max(
                    0,
                    incomingCategories.length - categories.length,
                ),
                categoriesMapped: nextTasks.filter(
                    (task) => task.categoryId !== normalizeTaskCategoryId(task),
                ).length,
            } satisfies ImportImpactSummary;

            let remappedSimpleTaskCategories = 0;
            const nextTasksWithInvariant =
                bundle.scope === "profile"
                    ? preserveSimpleTasks(tasks, nextTasks).map((task) => {
                          if (task.day !== null) {
                              return task;
                          }

                          const normalizedCategoryId =
                              normalizeTaskCategoryId(task);
                          if (incomingCategoryIds.has(normalizedCategoryId)) {
                              return task;
                          }

                          remappedSimpleTaskCategories += 1;
                          return {
                              ...task,
                              categoryId: BUILTIN_CATEGORY_IDS.task,
                          };
                      })
                    : nextTasks;

            if (remappedSimpleTaskCategories > 0) {
                summary.notes.push(
                    `${remappedSimpleTaskCategories} preserved simple task${remappedSimpleTaskCategories === 1 ? "" : "s"} had missing categories and were reassigned to Task.`,
                );
            }

            return applyCandidateValidation(
                nextTasksWithInvariant,
                profilesForReplace,
                incomingCategories,
                nextActiveProfileId,
                summary,
            );
        }

        if (mode === "merge_current_profile") {
            const mergedProfiles = profiles;
            let categoriesMappedByName = 0;
            let fallbackToTaskCount = 0;
            const incomingNormalized = incomingCategories.map((incoming) => {
                if (categories.some((entry) => entry.id === incoming.id)) {
                    return incoming;
                }
                const sameNameExisting = categories.find(
                    (entry) =>
                        entry.name.toLowerCase() === incoming.name.toLowerCase(),
                );
                if (sameNameExisting) {
                    categoriesMappedByName += 1;
                    return { ...incoming, id: sameNameExisting.id };
                }
                return incoming;
            });

            const mergedCategories = ensureBuiltInCategories(
                [...categories, ...incomingNormalized].slice(0, MAX_CATEGORIES),
            );
            const mergedCategoryIds = new Set(
                mergedCategories.map((category) => category.id),
            );

            let generatedCount = 0;
            const existingTaskIds = new Set(tasks.map((task) => task.id));
            const incomingMapped = importedTasks.map((task) => {
                const incomingTaskId = existingTaskIds.has(task.id)
                    ? (() => {
                          generatedCount += 1;
                          return crypto.randomUUID();
                      })()
                    : task.id;
                existingTaskIds.add(incomingTaskId);
                const normalizedCategoryId = normalizeTaskCategoryId(task);
                const resolvedCategoryId = mergedCategoryIds.has(normalizedCategoryId)
                    ? normalizedCategoryId
                    : BUILTIN_CATEGORY_IDS.task;
                if (resolvedCategoryId === BUILTIN_CATEGORY_IDS.task) {
                    fallbackToTaskCount += 1;
                }

                return {
                    ...task,
                    id: incomingTaskId,
                    profileId: activeProfileId,
                    categoryId: resolvedCategoryId,
                };
            });

            const nextTasks = preserveSimpleTasks(tasks, [...tasks, ...incomingMapped]);

            const warnings: string[] = [];
            if (generatedCount > 0) {
                warnings.push(
                    `${generatedCount} imported task ID collision${generatedCount === 1 ? "" : "s"} resolved by generating new IDs.`,
                );
            }
            if (fallbackToTaskCount > 0) {
                warnings.push(
                    `${fallbackToTaskCount} task${fallbackToTaskCount === 1 ? "" : "s"} could not match original categories and will be assigned to Task.`,
                );
            }

            const summary = {
                ...summaryBase,
                tasksAdded: incomingMapped.length,
                profilesAdded: 0,
                categoriesAdded: Math.max(
                    0,
                    mergedCategories.length - categories.length,
                ),
                categoriesMapped: categoriesMappedByName + fallbackToTaskCount,
            } satisfies ImportImpactSummary;

            return applyCandidateValidation(
                nextTasks,
                mergedProfiles,
                mergedCategories,
                activeProfileId,
                summary,
                warnings,
            );
        }

        if (mode === "replace_current_profile") {
            let categoriesMappedByName = 0;
            let fallbackToTaskCount = 0;
            const incomingNormalized = incomingCategories.map((incoming) => {
                if (categories.some((entry) => entry.id === incoming.id)) {
                    return incoming;
                }
                const sameNameExisting = categories.find(
                    (entry) =>
                        entry.name.toLowerCase() === incoming.name.toLowerCase(),
                );
                if (sameNameExisting) {
                    categoriesMappedByName += 1;
                    return { ...incoming, id: sameNameExisting.id };
                }
                return incoming;
            });

            const mergedCategories = ensureBuiltInCategories(
                [...categories, ...incomingNormalized].slice(0, MAX_CATEGORIES),
            );
            const mergedCategoryIds = new Set(
                mergedCategories.map((category) => category.id),
            );

            const remainingTasks = tasks.filter(
                (task) =>
                    task.day === null ||
                    normalizeTaskProfileId(task) !== activeProfileId,
            );

            let generatedCount = 0;
            const existingTaskIds = new Set(remainingTasks.map((task) => task.id));
            const replacementTasks = importedTasks.map((task) => {
                const nextId = existingTaskIds.has(task.id)
                    ? (() => {
                          generatedCount += 1;
                          return crypto.randomUUID();
                      })()
                    : task.id;
                existingTaskIds.add(nextId);
                const normalizedCategoryId = normalizeTaskCategoryId(task);
                const resolvedCategoryId = mergedCategoryIds.has(normalizedCategoryId)
                    ? normalizedCategoryId
                    : BUILTIN_CATEGORY_IDS.task;
                if (resolvedCategoryId === BUILTIN_CATEGORY_IDS.task) {
                    fallbackToTaskCount += 1;
                }

                return {
                    ...task,
                    id: nextId,
                    profileId: activeProfileId,
                    categoryId: resolvedCategoryId,
                };
            });

            const removedFromProfile =
                tasks.length - remainingTasks.length;
            const nextTasks = preserveSimpleTasks(
                tasks,
                [...remainingTasks, ...replacementTasks],
            );

            const warnings: string[] = [];
            if (generatedCount > 0) {
                warnings.push(
                    `${generatedCount} imported task ID collision${generatedCount === 1 ? "" : "s"} resolved by generating new IDs.`,
                );
            }
            if (fallbackToTaskCount > 0) {
                warnings.push(
                    `${fallbackToTaskCount} task${fallbackToTaskCount === 1 ? "" : "s"} could not match original categories and will be assigned to Task.`,
                );
            }

            const summary = {
                ...summaryBase,
                tasksAdded: replacementTasks.length,
                tasksRemoved: removedFromProfile,
                categoriesAdded: Math.max(
                    0,
                    mergedCategories.length - categories.length,
                ),
                categoriesMapped: categoriesMappedByName + fallbackToTaskCount,
            } satisfies ImportImpactSummary;

            return applyCandidateValidation(
                nextTasks,
                profiles,
                mergedCategories,
                activeProfileId,
                summary,
                warnings,
            );
        }

        const desiredName =
            options?.newProfileName?.trim() ||
            bundle.profile?.name ||
            formatImportProfileFallbackName();

        const uniqueName = getUniqueProfileName(desiredName, profiles);
        const now = Date.now();
        const newProfile: Profile = {
            id: crypto.randomUUID(),
            name: uniqueName,
            createdAt: now,
            updatedAt: now,
        };

        if (profiles.length >= MAX_PROFILES) {
            return {
                ok: false,
                error: `Cannot create a new profile. Maximum profiles (${MAX_PROFILES}) reached.`,
            };
        }

        let categoriesMappedByName = 0;
        let fallbackToTaskCount = 0;
        const incomingNormalized = incomingCategories.map((incoming) => {
            if (categories.some((entry) => entry.id === incoming.id)) {
                return incoming;
            }
            const sameNameExisting = categories.find(
                (entry) =>
                    entry.name.toLowerCase() === incoming.name.toLowerCase(),
            );
            if (sameNameExisting) {
                categoriesMappedByName += 1;
                return { ...incoming, id: sameNameExisting.id };
            }
            return incoming;
        });

        const mergedCategories = ensureBuiltInCategories(
            [...categories, ...incomingNormalized].slice(0, MAX_CATEGORIES),
        );
        const mergedCategoryIds = new Set(
            mergedCategories.map((category) => category.id),
        );

        let generatedCount = 0;
        const existingTaskIds = new Set(tasks.map((task) => task.id));
        const mappedTasks = importedTasks.map((task) => {
            const nextId = existingTaskIds.has(task.id)
                ? (() => {
                      generatedCount += 1;
                      return crypto.randomUUID();
                  })()
                : task.id;
            existingTaskIds.add(nextId);
            const normalizedCategoryId = normalizeTaskCategoryId(task);
            const resolvedCategoryId = mergedCategoryIds.has(normalizedCategoryId)
                ? normalizedCategoryId
                : BUILTIN_CATEGORY_IDS.task;
            if (resolvedCategoryId === BUILTIN_CATEGORY_IDS.task) {
                fallbackToTaskCount += 1;
            }

            return {
                ...task,
                id: nextId,
                profileId: newProfile.id,
                categoryId: resolvedCategoryId,
            };
        });

        const nextTasks = preserveSimpleTasks(tasks, [...tasks, ...mappedTasks]);

        const warnings: string[] = [];
        if (generatedCount > 0) {
            warnings.push(
                `${generatedCount} imported task ID collision${generatedCount === 1 ? "" : "s"} resolved by generating new IDs.`,
            );
        }
        if (fallbackToTaskCount > 0) {
            warnings.push(
                `${fallbackToTaskCount} task${fallbackToTaskCount === 1 ? "" : "s"} could not match original categories and will be assigned to Task.`,
            );
        }

        const summary = {
            ...summaryBase,
            tasksAdded: mappedTasks.length,
            profilesAdded: 1,
            categoriesAdded: Math.max(
                0,
                mergedCategories.length - categories.length,
            ),
            categoriesMapped: categoriesMappedByName + fallbackToTaskCount,
            notes: [
                ...summaryBase.notes,
                `New profile will be created as "${newProfile.name}".`,
            ],
        } satisfies ImportImpactSummary;

        return applyCandidateValidation(
            nextTasks,
            [...profiles, newProfile],
            mergedCategories,
            newProfile.id,
            summary,
            warnings,
        );
    };

    // --- Handlers ---
    const addTask = (e?: React.FormEvent) => {
        e?.preventDefault();
        const text = getValidatedTaskText(inputText);
        if (!text) return;

        const newTask: Task = {
            id: crypto.randomUUID(),
            text,
            categoryId: selectedCategoryId,
            completed: false,
            createdAt: Date.now(),
            day: null, // General task, not assigned to a specific day
            profileId: DEFAULT_PROFILE_ID,
        };

        const nextTasks = [newTask, ...tasks];
        if (!commitState(nextTasks, profiles, categories, activeProfileId)) {
            return;
        }
        setInputText("");
    };

    // Add or edit a task for the selected day with time range
    const addDailyTask = (e?: React.FormEvent) => {
        e?.preventDefault();
        const text = getValidatedTaskText(dailyTaskText);
        if (!text || selectedDay === null) return;

        if (timeToMinutes(dailyEndTime) <= timeToMinutes(dailyStartTime)) {
            setDailyTimeError("End time must be after start time.");
            return;
        }

        setDailyTimeError(null);

        const activeWeeklyTaskCount = tasks.filter(
            (task) =>
                task.day !== null &&
                normalizeTaskProfileId(task) === activeProfileId,
        ).length;

        if (
            !editingDailyTaskId &&
            activeWeeklyTaskCount >= MAX_WEEKLY_TASKS_PER_PROFILE
        ) {
            setInfoModal({
                title: "Weekly limit reached",
                message: `This profile reached the weekly task limit (${MAX_WEEKLY_TASKS_PER_PROFILE}).`,
            });
            return;
        }

        if (editingDailyTaskId) {
            // Edit existing task
            upsertTasks((prev) =>
                prev.map((t) =>
                    t.id === editingDailyTaskId
                        ? {
                              ...t,
                              text,
                              categoryId: dailyCategoryId,
                              startTime: dailyStartTime,
                              endTime: dailyEndTime,
                          }
                        : t,
                ),
            );
            setEditingDailyTaskId(null);
        } else {
            // Add new task
            const newTask: Task = {
                id: crypto.randomUUID(),
                text,
                categoryId: dailyCategoryId,
                completed: false,
                createdAt: Date.now(),
                day: selectedDay,
                startTime: dailyStartTime,
                endTime: dailyEndTime,
                profileId: activeProfileId,
            };
            upsertTasks((prev) => [newTask, ...prev]);
        }
        setDailyTaskText("");
        setDailyCategoryId(BUILTIN_CATEGORY_IDS.task);
        setDailyStartParts(timeToParts("09:00"));
        setDailyEndParts(timeToParts("10:00"));
        setDailyTimeError(null);
    };

    // Edit daily task handler
    const startEditDailyTask = (task: Task) => {
        setEditingDailyTaskId(task.id);
        setDailyTaskText(task.text);
        setDailyCategoryId(normalizeTaskCategoryId(task));
        setDailyStartParts(timeToParts(task.startTime || "09:00"));
        setDailyEndParts(timeToParts(task.endTime || "10:00"));
    };

    const cancelEditDailyTask = () => {
        setEditingDailyTaskId(null);
        setDailyTaskText("");
        setDailyCategoryId(BUILTIN_CATEGORY_IDS.task);
        setDailyStartParts(timeToParts("09:00"));
        setDailyEndParts(timeToParts("10:00"));
        setDailyTimeError(null);
    };

    const toggleTask = (id: string) => {
        upsertTasks((prev) =>
            prev.map((t) =>
                t.id === id ? { ...t, completed: !t.completed } : t,
            ),
        );
    };

    const deleteTask = (id: string) => {
        setConfirmDialog({
            title: "Delete Task",
            message: "Delete this task permanently? This action cannot be undone.",
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            tone: "danger",
            action: {
                type: "delete_task",
                taskId: id,
            },
        });
    };

    const clearCompletedInScope = (scope: TaskScope) => {
        upsertTasks((prev) =>
            prev.filter(
                (task) => !(isTaskInScope(task, scope) && task.completed),
            ),
        );
    };

    const deleteAllTasksInScope = (scope: TaskScope) => {
        upsertTasks((prev) =>
            prev.filter((task) => !isTaskInScope(task, scope)),
        );
    };

    const resetProgress = (scope: TaskScope) => {
        upsertTasks((prev) =>
            prev.map((task) =>
                isTaskInScope(task, scope) && task.completed
                    ? { ...task, completed: false }
                    : task,
            ),
        );
    };

    const openDeleteOptions = (scope: TaskScope) => {
        setDeleteScope(scope);
        setShowDeleteOptions(true);
    };

    const closeDeleteOptions = () => {
        setShowDeleteOptions(false);
    };

    const deleteCompletedFromModal = () => {
        clearCompletedInScope(deleteScope);
        setShowDeleteOptions(false);
    };

    const deleteAllFromModal = () => {
        deleteAllTasksInScope(deleteScope);
        setShowDeleteOptions(false);
    };

    const requestResetProgress = (scope: TaskScope) => {
        const scopeLabel =
            scope === "simple"
                ? "Simple Tasks"
                : `Weekly Schedule (${activeProfile?.name ?? "Default"})`;
        setConfirmDialog({
            title: "Reset Progress",
            message: `Reset progress for ${scopeLabel}? Completed tasks will be marked as pending.`,
            confirmLabel: "Reset",
            cancelLabel: "Cancel",
            tone: "primary",
            action: {
                type: "reset_progress",
                scope,
            },
        });
    };

    const exportTasks = (scope: ExportScope) => {
        const payload =
            scope === "profile"
                ? buildCurrentProfileExportPayload()
                : buildAllExportPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.href = url;
        link.download =
            scope === "profile"
                ? `lifesync-profile-backup-${stamp}.json`
                : `lifesync-backup-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const triggerImport = () => {
        clearImportState();
        fileInputRef.current?.click();
    };

    const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
            setImportModalError(
                "File is too large. Maximum supported import size is 1 MB.",
            );
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result ?? ""));
                const bundle = buildImportBundle(parsed as ImportRawPayload);
                setPendingImportBundle(bundle);
                setImportStep("select_mode");
                setImportModalError(null);
                setImportModalWarning(null);

                const suggestedName =
                    bundle.profile?.name || formatImportProfileFallbackName();
                setImportCreateProfileName(suggestedName);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Failed to import file.";
                setImportModalError(message);
            }
        };
        reader.onerror = () => {
            setImportModalError("Could not read that file.");
        };
        reader.readAsText(file);
    };

    const prepareImportPreview = () => {
        if (!pendingImportBundle) {
            setImportModalError("No import payload is loaded.");
            return;
        }

        const preview = applyImportMode(importSelectedMode, pendingImportBundle, {
            newProfileName: importCreateProfileName,
        });
        setImportPreviewResult(preview);
        setImportModalError(preview.ok ? null : preview.error ?? null);
        setImportModalWarning(preview.warnings?.[0] ?? preview.warning ?? null);
        if (preview.ok) {
            setImportStep("preview");
        }
    };

    useEffect(() => {
        if (!pendingImportBundle || importStep !== "preview") {
            return;
        }

        const refreshedPreview = applyImportMode(
            importSelectedMode,
            pendingImportBundle,
            {
                newProfileName: importCreateProfileName,
            },
        );

        setImportPreviewResult(refreshedPreview);
        setImportModalError(refreshedPreview.ok ? null : refreshedPreview.error ?? null);
        setImportModalWarning(
            refreshedPreview.warnings?.[0] ?? refreshedPreview.warning ?? null,
        );
    }, [
        importCreateProfileName,
        importSelectedMode,
        importStep,
        pendingImportBundle,
    ]);

    const executeImportMode = () => {
        if (!pendingImportBundle) {
            setImportModalError("No import payload is loaded.");
            return;
        }

        const result =
            importPreviewResult && importPreviewResult.ok
                ? importPreviewResult
                : applyImportMode(importSelectedMode, pendingImportBundle, {
                      newProfileName: importCreateProfileName,
                  });

        setImportModalWarning(result.warnings?.[0] ?? result.warning ?? null);

        if (
            !result.ok ||
            !result.nextTasks ||
            !result.nextProfiles ||
            !result.nextCategories ||
            !result.nextActiveProfileId
        ) {
            setImportModalError(result.error ?? "Import could not be applied.");
            return;
        }

        if (
            !commitState(
                result.nextTasks,
                result.nextProfiles,
                result.nextCategories,
                result.nextActiveProfileId,
            )
        ) {
            setImportModalError(
                "Import failed validation. Review limits and try another mode.",
            );
            return;
        }

        setSelectedCategoryId(
            result.nextSelectedCategoryId ?? BUILTIN_CATEGORY_IDS.task,
        );
        setDailyCategoryId(
            result.nextDailyCategoryId ?? BUILTIN_CATEGORY_IDS.task,
        );
        setGeneralEditCategoryId(
            result.nextGeneralEditCategoryId ?? BUILTIN_CATEGORY_IDS.task,
        );
        setActiveFilter(result.nextActiveFilter ?? "All");

        clearImportState();
    };

    const executeConfirmDialog = () => {
        if (!confirmDialog) return;

        const action = confirmDialog.action;

        if (action.type === "delete_task") {
            upsertTasks((prev) =>
                prev.filter((task) => task.id !== action.taskId),
            );
        }

        if (action.type === "reset_progress") {
            resetProgress(action.scope);
        }

        setConfirmDialog(null);
    };

    const createProfile = () => {
        if (profiles.length >= MAX_PROFILES) {
            setInfoModal({
                title: "Profile limit reached",
                message: `You can only have up to ${MAX_PROFILES} profiles.`,
            });
            return;
        }

        setProfileModal({
            mode: "create",
            title: "Create Profile",
            submitLabel: "Create",
            defaultValue: "",
        });
        setProfileModalInput("");
    };

    const createProfileFromName = (candidateName: string) => {
        const normalizedName = normalizeProfileName(candidateName);
        if (!normalizedName) {
            setInfoModal({
                title: "Invalid profile name",
                message: "Profile name cannot be empty.",
            });
            return;
        }

        if (normalizedName.length > MAX_PROFILE_NAME_LENGTH) {
            setInfoModal({
                title: "Profile name too long",
                message: `Profile name is too long. Maximum is ${MAX_PROFILE_NAME_LENGTH} characters.`,
            });
            return;
        }

        if (
            profiles.some(
                (profile) =>
                    profile.name.toLowerCase() === normalizedName.toLowerCase(),
            )
        ) {
            setInfoModal({
                title: "Duplicate profile",
                message: "A profile with this name already exists.",
            });
            return;
        }

        const now = Date.now();
        const nextProfile: Profile = {
            id: crypto.randomUUID(),
            name: normalizedName,
            createdAt: now,
            updatedAt: now,
        };

        const nextProfiles = [...profiles, nextProfile];
        if (commitState(tasks, nextProfiles, categories, nextProfile.id)) {
            setProfileModal(null);
            setProfileModalInput("");
        }
    };

    const duplicateActiveProfile = () => {
        if (!activeProfile) return;
        if (profiles.length >= MAX_PROFILES) {
            setInfoModal({
                title: "Profile limit reached",
                message: `You can only have up to ${MAX_PROFILES} profiles.`,
            });
            return;
        }

        setProfileModal({
            mode: "duplicate",
            title: "Duplicate Profile",
            submitLabel: "Duplicate",
            defaultValue: `${activeProfile.name} Copy`,
        });
        setProfileModalInput(`${activeProfile.name} Copy`);
    };

    const duplicateActiveProfileWithName = (candidateName: string) => {
        if (!activeProfile) return;

        const normalizedName = normalizeProfileName(candidateName);
        if (!normalizedName) {
            setInfoModal({
                title: "Invalid profile name",
                message: "Profile name cannot be empty.",
            });
            return;
        }

        if (normalizedName.length > MAX_PROFILE_NAME_LENGTH) {
            setInfoModal({
                title: "Profile name too long",
                message: `Profile name is too long. Maximum is ${MAX_PROFILE_NAME_LENGTH} characters.`,
            });
            return;
        }

        if (
            profiles.some(
                (profile) =>
                    profile.name.toLowerCase() === normalizedName.toLowerCase(),
            )
        ) {
            setInfoModal({
                title: "Duplicate profile",
                message: "A profile with this name already exists.",
            });
            return;
        }

        const sourceTasks = tasks.filter(
            (task) =>
                task.day !== null &&
                normalizeTaskProfileId(task) === activeProfile.id,
        );

        if (sourceTasks.length > MAX_WEEKLY_TASKS_PER_PROFILE) {
            setInfoModal({
                title: "Cannot duplicate profile",
                message: `Cannot duplicate. Source profile exceeds ${MAX_WEEKLY_TASKS_PER_PROFILE} weekly tasks.`,
            });
            return;
        }

        const now = Date.now();
        const newProfileId = crypto.randomUUID();
        const duplicatedProfile: Profile = {
            id: newProfileId,
            name: normalizedName,
            createdAt: now,
            updatedAt: now,
        };

        const duplicatedTasks = sourceTasks.map((task) => ({
            ...task,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            profileId: newProfileId,
        }));

        const nextTasks = [...tasks, ...duplicatedTasks];
        const nextProfiles = [...profiles, duplicatedProfile];
        if (
            commitState(nextTasks, nextProfiles, categories, duplicatedProfile.id)
        ) {
            setProfileModal(null);
            setProfileModalInput("");
        }
    };

    const renameActiveProfile = () => {
        if (!activeProfile) return;

        setProfileModal({
            mode: "rename",
            title: "Rename Profile",
            submitLabel: "Save",
            defaultValue: activeProfile.name,
        });
        setProfileModalInput(activeProfile.name);
    };

    const renameActiveProfileWithName = (candidateName: string) => {
        if (!activeProfile) return;

        const normalizedName = normalizeProfileName(candidateName);
        if (!normalizedName) {
            setInfoModal({
                title: "Invalid profile name",
                message: "Profile name cannot be empty.",
            });
            return;
        }

        if (normalizedName.length > MAX_PROFILE_NAME_LENGTH) {
            setInfoModal({
                title: "Profile name too long",
                message: `Profile name is too long. Maximum is ${MAX_PROFILE_NAME_LENGTH} characters.`,
            });
            return;
        }

        if (
            profiles.some(
                (profile) =>
                    profile.id !== activeProfile.id &&
                    profile.name.toLowerCase() === normalizedName.toLowerCase(),
            )
        ) {
            setInfoModal({
                title: "Duplicate profile",
                message: "A profile with this name already exists.",
            });
            return;
        }

        const nextProfiles = profiles.map((profile) =>
            profile.id === activeProfile.id
                ? { ...profile, name: normalizedName, updatedAt: Date.now() }
                : profile,
        );

        if (commitState(tasks, nextProfiles, categories, activeProfile.id)) {
            setProfileModal(null);
            setProfileModalInput("");
        }
    };

    const submitProfileModal = () => {
        if (!profileModal) return;

        if (profileModal.mode === "create") {
            createProfileFromName(profileModalInput);
            return;
        }

        if (profileModal.mode === "duplicate") {
            duplicateActiveProfileWithName(profileModalInput);
            return;
        }

        renameActiveProfileWithName(profileModalInput);
    };

    const requestDeleteProfile = () => {
        if (!activeProfile) return;

        if (profiles.length <= 1) {
            setShowProfileLimitModal(true);
            return;
        }

        setProfileDeleteTargetId(activeProfile.id);
        setShowProfileDeleteConfirm(true);
    };

    const confirmDeleteProfile = () => {
        if (!profileDeleteTargetId) return;

        const remainingProfiles = profiles.filter(
            (profile) => profile.id !== profileDeleteTargetId,
        );
        if (remainingProfiles.length === 0) {
            setShowProfileDeleteConfirm(false);
            setProfileDeleteTargetId(null);
            setShowProfileLimitModal(true);
            return;
        }

        const fallbackProfileId =
            remainingProfiles.find((profile) => profile.id === activeProfileId)
                ?.id ?? remainingProfiles[0].id;

        const nextTasks = tasks.filter(
            (task) =>
                task.day === null ||
                normalizeTaskProfileId(task) !== profileDeleteTargetId,
        );

        if (
            !commitState(
                nextTasks,
                remainingProfiles,
                categories,
                fallbackProfileId,
            )
        ) {
            return;
        }

        setShowProfileDeleteConfirm(false);
        setProfileDeleteTargetId(null);
    };

    const createCategory = () => {
        if (categories.length >= MAX_CATEGORIES) {
            setInfoModal({
                title: "Category limit reached",
                message: `You can only have up to ${MAX_CATEGORIES} categories.`,
            });
            return;
        }

        const normalizedName = normalizeCategoryName(newCategoryName);
        if (!normalizedName) {
            setInfoModal({
                title: "Invalid category name",
                message: "Category name cannot be empty.",
            });
            return;
        }

        if (normalizedName.length > MAX_CATEGORY_NAME_LENGTH) {
            setInfoModal({
                title: "Category name too long",
                message: `Category name is too long. Maximum is ${MAX_CATEGORY_NAME_LENGTH} characters.`,
            });
            return;
        }

        if (
            categories.some(
                (category) =>
                    category.name.toLowerCase() === normalizedName.toLowerCase(),
            )
        ) {
            setInfoModal({
                title: "Duplicate category",
                message: "A category with this name already exists.",
            });
            return;
        }

        const now = Date.now();
        const nextCategory: CategoryDef = {
            id: crypto.randomUUID(),
            name: normalizedName,
            colorToken: newCategoryColorToken,
            iconToken: newCategoryIconToken,
            isBuiltIn: false,
            createdAt: now,
            updatedAt: now,
        };

        const nextCategories = [...categories, nextCategory];
        if (!commitState(tasks, profiles, nextCategories, activeProfileId)) {
            return;
        }

        setNewCategoryName("");
        setNewCategoryColorToken("blue");
        setNewCategoryIconToken("📌");
        setSelectedCategoryId(nextCategory.id);
        setDailyCategoryId(nextCategory.id);
    };

    const startEditCategory = (category: CategoryDef) => {
        if (category.isBuiltIn) {
            setInfoModal({
                title: "Built-in category",
                message: "Built-in categories cannot be edited.",
            });
            return;
        }

        setEditingCategoryId(category.id);
        setEditingCategoryName(category.name);
        setEditingCategoryColorToken(category.colorToken);
        setEditingCategoryIconToken(category.iconToken);
    };

    const saveEditedCategory = () => {
        if (!editingCategoryId) return;

        const targetCategory = categories.find(
            (category) => category.id === editingCategoryId,
        );
        if (!targetCategory || targetCategory.isBuiltIn) {
            setEditingCategoryId(null);
            return;
        }

        const normalizedName = normalizeCategoryName(editingCategoryName);
        if (!normalizedName) {
            setInfoModal({
                title: "Invalid category name",
                message: "Category name cannot be empty.",
            });
            return;
        }

        if (normalizedName.length > MAX_CATEGORY_NAME_LENGTH) {
            setInfoModal({
                title: "Category name too long",
                message: `Category name is too long. Maximum is ${MAX_CATEGORY_NAME_LENGTH} characters.`,
            });
            return;
        }

        if (
            categories.some(
                (category) =>
                    category.id !== editingCategoryId &&
                    category.name.toLowerCase() === normalizedName.toLowerCase(),
            )
        ) {
            setInfoModal({
                title: "Duplicate category",
                message: "A category with this name already exists.",
            });
            return;
        }

        const nextCategories = categories.map((category) =>
            category.id === editingCategoryId
                ? {
                      ...category,
                      name: normalizedName,
                      colorToken: editingCategoryColorToken,
                      iconToken: editingCategoryIconToken,
                      updatedAt: Date.now(),
                  }
                : category,
        );

        if (!commitState(tasks, profiles, nextCategories, activeProfileId)) {
            return;
        }

        setEditingCategoryId(null);
        setEditingCategoryName("");
    };

    const requestDeleteCategory = (categoryId: string) => {
        const category = categories.find((entry) => entry.id === categoryId);
        if (!category || category.isBuiltIn) {
            setInfoModal({
                title: "Built-in category",
                message: "Built-in categories cannot be deleted.",
            });
            return;
        }

        const fallbackReassignId =
            availableCategoryReassignOptions.find(
                (entry) => entry.id !== categoryId,
            )?.id ?? BUILTIN_CATEGORY_IDS.task;

        setCategoryDeleteTargetId(categoryId);
        setCategoryDeleteReassignId(fallbackReassignId);
        setShowCategoryDeleteConfirm(true);
    };

    const confirmDeleteCategory = () => {
        if (!categoryDeleteTargetId) return;

        const targetCategory = categories.find(
            (category) => category.id === categoryDeleteTargetId,
        );
        if (!targetCategory || targetCategory.isBuiltIn) {
            setShowCategoryDeleteConfirm(false);
            setCategoryDeleteTargetId(null);
            return;
        }

        const reassignCategory = categories.find(
            (category) =>
                category.id === categoryDeleteReassignId &&
                category.id !== categoryDeleteTargetId,
        );
        if (!reassignCategory) {
            setInfoModal({
                title: "Invalid reassignment",
                message: "Please choose a valid category to reassign tasks.",
            });
            return;
        }

        const nextCategories = categories.filter(
            (category) => category.id !== categoryDeleteTargetId,
        );
        const nextTasks = tasks.map((task) =>
            normalizeTaskCategoryId(task) === categoryDeleteTargetId
                ? { ...task, categoryId: reassignCategory.id }
                : task,
        );

        const nextSelectedCategoryId =
            selectedCategoryId === categoryDeleteTargetId
                ? reassignCategory.id
                : selectedCategoryId;
        const nextDailyCategoryId =
            dailyCategoryId === categoryDeleteTargetId
                ? reassignCategory.id
                : dailyCategoryId;
        const nextGeneralEditCategoryId =
            generalEditCategoryId === categoryDeleteTargetId
                ? reassignCategory.id
                : generalEditCategoryId;
        const nextActiveFilter =
            activeFilter === categoryDeleteTargetId ? "All" : activeFilter;

        if (!commitState(nextTasks, profiles, nextCategories, activeProfileId)) {
            return;
        }

        setSelectedCategoryId(nextSelectedCategoryId);
        setDailyCategoryId(nextDailyCategoryId);
        setGeneralEditCategoryId(nextGeneralEditCategoryId);
        setActiveFilter(nextActiveFilter);
        setShowCategoryDeleteConfirm(false);
        setCategoryDeleteTargetId(null);
    };

    const cancelDeleteCategory = () => {
        setShowCategoryDeleteConfirm(false);
        setCategoryDeleteTargetId(null);
    };

    // --- Derived State ---
    const simpleTasks = tasks.filter((task) => task.day === null);
    const weeklyTasks = tasks.filter(
        (task) =>
            task.day !== null &&
            normalizeTaskProfileId(task) === activeProfileId,
    );

    const filteredTasks = simpleTasks.filter((t) => {
        if (activeFilter === "All") return true;
        return normalizeTaskCategoryId(t) === activeFilter;
    });

    const simpleStats = {
        total: simpleTasks.length,
        completed: simpleTasks.filter((task) => task.completed).length,
        pending: simpleTasks.filter((task) => !task.completed).length,
    };

    const weeklyStats = {
        total: weeklyTasks.length,
        completed: weeklyTasks.filter((task) => task.completed).length,
        pending: weeklyTasks.filter((task) => !task.completed).length,
    };

    const deleteScopeStats =
        deleteScope === "simple" ? simpleStats : weeklyStats;

    const progress =
        simpleStats.total === 0
            ? 0
            : Math.round((simpleStats.completed / simpleStats.total) * 100);

    const dayTasks = weeklyTasks.filter((task) => task.day === selectedDay);
    const dayStats = {
        total: dayTasks.length,
        completed: dayTasks.filter((task) => task.completed).length,
        pending: dayTasks.filter((task) => !task.completed).length,
    };

    const categoryDeleteTarget = categoryDeleteTargetId
        ? categories.find((category) => category.id === categoryDeleteTargetId)
        : null;

    const categoryDeleteAffectedTasks = categoryDeleteTargetId
        ? tasks.filter((task) => normalizeTaskCategoryId(task) === categoryDeleteTargetId)
              .length
        : 0;

    const availableCategoryReassignOptions = categories.filter(
        (category) => category.id !== categoryDeleteTargetId,
    );

    const dailySelectedCategory = getCategoryById(dailyCategoryId);

    return (
        <div className="min-h-screen transition-colors duration-300 bg-[#e2e8f0] dark:bg-[#020617] text-slate-900 dark:text-slate-200 selection:bg-purple-500/30 font-sans flex flex-col overflow-x-hidden">
            <div className="mx-auto py-8 md:py-12 flex-1 w-full max-w-none px-4 md:px-8 lg:px-10">
                {/* Header */}
                <header className="mb-8 flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 dark:text-transparent dark:bg-gradient-to-r dark:from-purple-400 dark:via-pink-400 dark:to-blue-400 dark:bg-clip-text">
                            LifeSync
                        </h1>
                        <p className="text-slate-600 dark:text-slate-500 font-bold">
                            Master your day.
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <button
                            onClick={() => setIsDark(!isDark)}
                            className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border-2 border-slate-300 dark:border-slate-700 hover:scale-105 active:scale-95 transition-all text-orange-600 dark:text-purple-400"
                            title={
                                isDark
                                    ? "Switch to Light Mode"
                                    : "Switch to Dark Mode"
                            }
                        >
                            {isDark ? (
                                <Sun size={24} fill="currentColor" />
                            ) : (
                                <Moon size={24} fill="currentColor" />
                            )}
                        </button>
                        <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wide">
                            <Calendar size={12} />
                            {format(new Date(), "MMM do")}
                        </div>
                    </div>
                </header>

                {/* Navigation Menu for Tabs */}
                <nav className="mb-8 flex justify-center gap-4">
                    <button
                        className={cn(
                            "px-4 py-2 rounded-lg font-bold transition-all",
                            activeTab === 0
                                ? "bg-blue-600 text-white shadow"
                                : "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700",
                        )}
                        onClick={() => {
                            setActiveTab(0);
                            setSelectedDay(null);
                        }}
                    >
                        Simple Tasks
                    </button>
                    <button
                        className={cn(
                            "px-4 py-2 rounded-lg font-bold transition-all",
                            activeTab === 1
                                ? "bg-green-600 text-white shadow"
                                : "bg-white dark:bg-slate-800 text-green-600 dark:text-green-300 border border-green-200 dark:border-green-700",
                        )}
                        onClick={() => {
                            setActiveTab(1);
                            setSelectedDay(null);
                        }}
                    >
                        Weekly Schedule
                    </button>
                </nav>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleImportFile}
                />

                {storageNotice && (
                    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                        {storageNotice}
                    </div>
                )}

                {/* Tab Content */}
                {activeTab === 0 && (
                    <div className="mx-auto w-full max-w-3xl">
                        {/* Progress Card */}
                        <div className="mb-8 bg-white dark:bg-slate-900/50 rounded-2xl p-6 border-2 border-white dark:border-slate-800/50 shadow-xl shadow-slate-300 dark:shadow-none backdrop-blur-sm transition-all">
                            <div className="flex justify-between items-end mb-3">
                                <div>
                                    <span className="text-4xl font-black text-slate-800 dark:text-white">
                                        {progress}%
                                    </span>
                                    <span className="text-slate-600 ml-2 text-sm font-bold uppercase tracking-wider">
                                        completed
                                    </span>
                                </div>
                                <div className="text-xs font-bold text-slate-600 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full">
                                    {simpleStats.completed} /{" "}
                                    {simpleStats.total}
                                </div>
                            </div>
                            <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-transparent">
                                <div
                                    className="h-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all duration-700 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        {/* Input Area */}
                        <form
                            onSubmit={addTask}
                            className="mb-8 relative group z-10"
                        >
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl opacity-0 dark:opacity-20 group-hover:opacity-40 transition duration-500 blur-sm"></div>
                            <div className="relative flex flex-col md:flex-row gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border-2 border-white dark:border-slate-800 shadow-xl dark:shadow-none transition-colors">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) =>
                                        setInputText(e.target.value)
                                    }
                                    placeholder="Add a new task..."
                                    className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 px-3 font-bold text-lg"
                                />

                                <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-3 md:pt-0 md:pl-3">
                                    <div className="flex gap-1">
                                        {categories.map((category) => {
                                            const style = getCategoryColorStyle(
                                                category.colorToken,
                                            );
                                            return (
                                                <button
                                                    key={category.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedCategoryId(
                                                            category.id,
                                                        )
                                                    }
                                                    className={cn(
                                                        "p-2 rounded-lg transition-all border-2",
                                                        selectedCategoryId ===
                                                            category.id
                                                            ? `${style.colorClass} ${style.borderClass} ring-2 ring-offset-1 dark:ring-offset-slate-900`
                                                            : "text-slate-400 dark:text-slate-500 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800",
                                                    )}
                                                    title={category.name}
                                                >
                                                    <span className="text-base">
                                                        {category.iconToken}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!inputText.trim()}
                                        className="ml-auto md:ml-2 bg-slate-900 dark:bg-white text-white dark:text-slate-950 p-2.5 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md font-bold"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                        </form>

                        {/* Filters + Actions */}
                        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                <button
                                    onClick={() => setActiveFilter("All")}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap shadow-sm border-2",
                                        activeFilter === "All"
                                            ? "bg-white dark:bg-slate-100 text-slate-900 dark:text-slate-900 border-slate-300 dark:border-transparent ring-2 ring-slate-200 dark:ring-0"
                                            : "bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-800",
                                    )}
                                >
                                    All
                                </button>
                                {categories.map((category) => {
                                    const style = getCategoryColorStyle(
                                        category.colorToken,
                                    );
                                    return (
                                        <button
                                            key={category.id}
                                            onClick={() =>
                                                setActiveFilter(category.id)
                                            }
                                            className={cn(
                                                "px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap border-2 shadow-sm",
                                                activeFilter === category.id
                                                    ? `${style.colorClass} ${style.borderClass} bg-white dark:bg-transparent`
                                                    : "bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-800",
                                            )}
                                        >
                                            <span>{category.iconToken}</span>
                                            {category.name}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => exportTasks("all")}
                                    className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    <Download size={14} />
                                    Export all
                                </button>
                                <button
                                    onClick={() => exportTasks("profile")}
                                    className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    <Download size={14} />
                                    Export profile
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryManager(true)}
                                    className="text-xs font-bold text-purple-700 dark:text-purple-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-purple-300 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                >
                                    Manage Categories
                                </button>
                                <button
                                    onClick={triggerImport}
                                    className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    <Upload size={14} />
                                    Import
                                </button>
                                <button
                                    onClick={() =>
                                        requestResetProgress("simple")
                                    }
                                    disabled={simpleStats.completed === 0}
                                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Reset Progress
                                </button>
                                <button
                                    onClick={() => openDeleteOptions("simple")}
                                    className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                    <Trash2 size={14} />
                                    Delete all tasks
                                </button>
                            </div>
                        </div>

                        {/* Task List */}
                        <div className="space-y-3 pb-8">
                            {filteredTasks.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="inline-flex items-center justify-center p-6 rounded-full bg-white dark:bg-slate-900 mb-4 shadow-md border-2 border-white dark:border-transparent">
                                        <Layout
                                            size={40}
                                            className="text-slate-300 dark:text-slate-700"
                                        />
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 font-bold">
                                        No tasks found. Time to add one!
                                    </p>
                                </div>
                            ) : (
                                filteredTasks.map((task) => {
                                    const category = getCategoryById(
                                        normalizeTaskCategoryId(task),
                                    );
                                    const categoryStyle = getCategoryColorStyle(
                                        category.colorToken,
                                    );

                                    if (editingGeneralTaskId === task.id) {
                                        // Edit mode for general task
                                        return (
                                            <form
                                                key={task.id}
                                                className={cn(
                                                    "group flex items-center gap-4 p-4 rounded-xl transition-all duration-300 bg-white border-l-[6px] shadow-md border-y border-r border-slate-200 dark:bg-slate-900 dark:border-l-0 dark:border dark:border-slate-800 dark:shadow-none",
                                                )}
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    const validatedText =
                                                        getValidatedTaskText(
                                                            generalEditText,
                                                        );
                                                    if (!validatedText) return;
                                                    upsertTasks((prev) =>
                                                        prev.map((t) =>
                                                            t.id === task.id
                                                                ? {
                                                                      ...t,
                                                                      text: validatedText,
                                                                      categoryId:
                                                                          generalEditCategoryId,
                                                                  }
                                                                : t,
                                                        ),
                                                    );
                                                    setEditingGeneralTaskId(
                                                        null,
                                                    );
                                                }}
                                            >
                                                <div className="flex-1 min-w-0 flex flex-col md:flex-row gap-2">
                                                    <input
                                                        type="text"
                                                        value={generalEditText}
                                                        onChange={(e) =>
                                                            setGeneralEditText(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="flex-1 bg-slate-100 dark:bg-slate-800 border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 px-3 font-bold text-lg rounded"
                                                    />
                                                    <select
                                                        value={
                                                            generalEditCategoryId
                                                        }
                                                        onChange={(e) =>
                                                            setGeneralEditCategoryId(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white px-2 py-2 rounded-lg font-bold"
                                                    >
                                                        {categories.map(
                                                            (entry) => (
                                                                <option
                                                                    key={
                                                                        entry.id
                                                                    }
                                                                    value={
                                                                        entry.id
                                                                    }
                                                                >
                                                                    {`${entry.iconToken} ${entry.name}`}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </div>
                                                <button
                                                    type="submit"
                                                    className="text-green-600 hover:text-green-800 font-bold px-2"
                                                    title="Save"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setEditingGeneralTaskId(
                                                            null,
                                                        )
                                                    }
                                                    className="text-slate-400 hover:text-red-600 font-bold px-2"
                                                    title="Cancel"
                                                >
                                                    Cancel
                                                </button>
                                            </form>
                                        );
                                    }

                                    return (
                                        <div
                                            key={task.id}
                                                className={cn(
                                                    "group flex items-center gap-4 p-4 rounded-xl transition-all duration-300",
                                                // Light Mode Styles (Distinct Card)
                                                "bg-white border-l-[6px] shadow-md border-y border-r border-slate-200",
                                                // Dark Mode Styles
                                                "dark:bg-slate-900 dark:border-l-0 dark:border dark:border-slate-800 dark:shadow-none",
                                                task.completed
                                                    ? "opacity-60 grayscale bg-slate-50 dark:bg-slate-900/30"
                                                    : "hover:-translate-y-0.5 hover:shadow-lg dark:hover:border-slate-700",
                                                // Dynamic Border Color for Light Mode
                                                categoryStyle.borderClass,
                                            )}
                                        >
                                            <button
                                                onClick={() =>
                                                    toggleTask(task.id)
                                                }
                                                className={cn(
                                                    "flex-shrink-0 transition-colors transform active:scale-90",
                                                    task.completed
                                                        ? "text-emerald-500"
                                                        : "text-slate-400 dark:text-slate-600 hover:text-purple-600 dark:hover:text-purple-400",
                                                )}
                                            >
                                                {task.completed ? (
                                                    <CheckCircle2
                                                        size={26}
                                                        className="fill-current"
                                                    />
                                                ) : (
                                                    <Circle
                                                        size={26}
                                                        strokeWidth={2.5}
                                                    />
                                                )}
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <p
                                                    className={cn(
                                                        "text-lg font-bold transition-all truncate",
                                                        task.completed
                                                            ? "text-slate-400 line-through decoration-slate-300 dark:decoration-slate-700"
                                                            : "text-slate-800 dark:text-slate-200",
                                                    )}
                                                >
                                                    {task.text}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span
                                                        className={cn(
                                                            "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold flex items-center gap-1 w-fit",
                                                            categoryStyle.colorClass,
                                                            // Stronger border for category tag in light mode
                                                            "border-current opacity-80",
                                                        )}
                                                    >
                                                        <span>{category.iconToken}</span>{" "}
                                                        {category.name}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setEditingGeneralTaskId(
                                                        task.id,
                                                    );
                                                    setGeneralEditText(
                                                        task.text,
                                                    );
                                                    setGeneralEditCategoryId(
                                                        normalizeTaskCategoryId(
                                                            task,
                                                        ),
                                                    );
                                                }}
                                                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                                                title="Edit task"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() =>
                                                    deleteTask(task.id)
                                                }
                                                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Delete task"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 1 && (
                    <div className="w-full">
                        <div className="mb-8 w-full rounded-2xl border-2 border-white bg-white p-4 shadow-xl transition-all dark:border-slate-800/50 dark:bg-slate-900 dark:shadow-none md:p-6 lg:p-8">
                            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <h2 className="text-2xl font-bold text-center md:text-left">
                                    Weekly Schedule
                                </h2>
                                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
                                    <select
                                        value={activeProfileId}
                                        onChange={(e) => {
                                            const nextProfileId =
                                                e.target.value;
                                            if (
                                                !profiles.some(
                                                    (profile) =>
                                                        profile.id ===
                                                        nextProfileId,
                                                )
                                            ) {
                                                return;
                                            }
                                            setActiveProfileId(nextProfileId);
                                        }}
                                        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        title="Active profile"
                                    >
                                        {profiles.map((profile) => (
                                            <option
                                                key={profile.id}
                                                value={profile.id}
                                            >
                                                {profile.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={createProfile}
                                        className="text-xs font-bold text-green-700 dark:text-green-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    >
                                        + Profile
                                    </button>
                                    <button
                                        type="button"
                                        onClick={duplicateActiveProfile}
                                        className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        Duplicate
                                    </button>
                                    <button
                                        type="button"
                                        onClick={renameActiveProfile}
                                        className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        onClick={requestDeleteProfile}
                                        className="text-xs font-bold text-red-600 dark:text-red-400 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                        Delete Profile
                                    </button>
                                    <button
                                        onClick={() => exportTasks("all")}
                                        className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        <Download size={14} />
                                        Export all
                                    </button>
                                    <button
                                        onClick={() => exportTasks("profile")}
                                        className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        <Download size={14} />
                                        Export profile
                                    </button>
                                    <button
                                        onClick={triggerImport}
                                        className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        <Upload size={14} />
                                        Import
                                    </button>
                                    <button
                                        onClick={() =>
                                            requestResetProgress("weekly")
                                        }
                                        disabled={weeklyStats.completed === 0}
                                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Reset Progress
                                    </button>
                                    <button
                                        onClick={() =>
                                            openDeleteOptions("weekly")
                                        }
                                        className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                        <Trash2 size={14} />
                                        Delete all tasks
                                    </button>
                                </div>
                            </div>

                            <div className="mx-auto">
                                <div className="my-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:gap-4">
                                    {[
                                        "Sunday",
                                        "Monday",
                                        "Tuesday",
                                        "Wednesday",
                                        "Thursday",
                                        "Friday",
                                        "Saturday",
                                    ].map((day, idx) => {
                                        const dayTasks = weeklyTasks
                                            .filter((t) => t.day === idx)
                                            .sort((a, b) => {
                                                if (
                                                    !a.startTime ||
                                                    !b.startTime
                                                )
                                                    return 0;
                                                return (
                                                    timeToMinutes(a.startTime) -
                                                    timeToMinutes(b.startTime)
                                                );
                                            });

                                        return (
                                            <div
                                                key={day}
                                                className="min-w-0 bg-transparent flex flex-col h-full items-stretch"
                                            >
                                                {/* Day header button - ONLY this gets highlighted */}
                                                <button
                                                    className={cn(
                                                        "py-3 px-4 mb-3 transition-all text-base font-bold text-center rounded-lg w-full",
                                                        selectedDay === idx
                                                            ? "bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100"
                                                            : "hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent",
                                                    )}
                                                    onClick={() =>
                                                        setSelectedDay(idx)
                                                    }
                                                >
                                                    {day}
                                                </button>

                                                {/* Divider */}
                                                <div className="border-t border-slate-200 dark:border-slate-700 mb-3" />

                                                <div className="px-3 pb-2 min-w-0 flex-1 bg-transparent transition-none">
                                                    {dayTasks.length === 0 ? (
                                                        <div className="text-xs text-slate-500 italic text-center">
                                                            No tasks yet.
                                                        </div>
                                                    ) : (
                                                        <ul className="space-y-3">
                                                            {dayTasks.map(
                                                                (task) => {
                                                                    const category =
                                                                        getCategoryById(
                                                                            normalizeTaskCategoryId(
                                                                                task,
                                                                            ),
                                                                        );
                                                                    const categoryStyle =
                                                                        getCategoryColorStyle(
                                                                            category.colorToken,
                                                                        );
                                                                    return (
                                                                        <li
                                                                            key={
                                                                                task.id
                                                                            }
                                                                            className={cn(
                                                                                "w-full min-w-0 box-border rounded-lg p-3 text-sm font-semibold flex flex-col border-l-4 cursor-pointer transition-all",
                                                                                categoryStyle.colorClass,
                                                                                categoryStyle.borderClass,
                                                                                task.completed
                                                                                    ? "opacity-60 line-through"
                                                                                    : "hover:bg-slate-100 dark:hover:bg-slate-800",
                                                                            )}
                                                                            onClick={() =>
                                                                                toggleTask(
                                                                                    task.id,
                                                                                )
                                                                            }
                                                                            title="Click to mark as done/undone"
                                                                        >
                                                                            <div className="flex items-start gap-3">
                                                                                <div className="flex-shrink-0">
                                                                                    {task.completed ? (
                                                                                        <CheckCircle2
                                                                                            size={
                                                                                                16
                                                                                            }
                                                                                            className="text-emerald-500"
                                                                                        />
                                                                                    ) : (
                                                                                        <Circle
                                                                                            size={
                                                                                                16
                                                                                            }
                                                                                            className="text-slate-400"
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                                <div className="min-w-0 flex-1 w-full">
                                                                                    {/* Task title with matching category icon */}
                                                                                    <div className="mb-2 flex min-w-0 items-start gap-2">
                                                                                        <span className="mt-0.5 shrink-0 text-slate-700 dark:text-slate-300">
                                                                                            {category.iconToken}
                                                                                        </span>
                                                                                        <div
                                                                                            className="text-sm min-w-0"
                                                                                            style={{
                                                                                                wordWrap:
                                                                                                    "break-word",
                                                                                                overflowWrap:
                                                                                                    "break-word",
                                                                                            }}
                                                                                        >
                                                                                            {
                                                                                                task.text
                                                                                            }
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Task time with no wrapping */}
                                                                                    <div className="mt-1 block w-full text-xs font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-200 break-words">
                                                                                        {
                                                                                            task.startTime
                                                                                        }{" "}
                                                                                        -{" "}
                                                                                        {
                                                                                            task.endTime
                                                                                        }
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </li>
                                                                    );
                                                                },
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-6 text-center text-sm text-slate-500">
                                Click a day to view or add tasks for that day.
                            </div>
                        </div>
                    </div>
                )}

                {/* Daily View: Only show if a day is selected */}
                {selectedDay !== null && (
                    <div className="flex justify-center w-full">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 px-8 border-2 border-white dark:border-slate-800/50 shadow-xl shadow-slate-300 dark:shadow-none transition-all w-full max-w-4xl mt-8">
                            <h2 className="text-2xl font-bold mb-4 text-center">
                                Daily View ({activeProfile?.name ?? "Default"})
                                -{" "}
                                {
                                    [
                                        "Sunday",
                                        "Monday",
                                        "Tuesday",
                                        "Wednesday",
                                        "Thursday",
                                        "Friday",
                                        "Saturday",
                                    ][selectedDay]
                                }
                            </h2>
                            {/* Progress Bar for Daily View */}
                            {(() => {
                                const completed = dayStats.completed;
                                const total = dayStats.total;
                                const progress =
                                    total === 0
                                        ? 0
                                        : Math.round((completed / total) * 100);
                                return (
                                    <div className="mb-6">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
                                                {progress}% completed
                                            </span>
                                            <span className="text-xs font-bold text-slate-600 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full">
                                                {completed} / {total}
                                            </span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-transparent">
                                            <div
                                                className="h-full bg-gradient-to-r from-green-400 to-blue-600 transition-all duration-700 ease-out"
                                                style={{
                                                    width: `${progress}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* Add Task Form for Daily View */}
                            <form
                                onSubmit={addDailyTask}
                                className="mb-6 w-full"
                            >
                                <div className="flex flex-col gap-3 w-full">
                                    <div className="flex flex-col gap-3 w-full lg:flex-row lg:items-center">
                                        <input
                                            type="text"
                                            value={dailyTaskText}
                                            onChange={(e) =>
                                                setDailyTaskText(e.target.value)
                                            }
                                            placeholder="Task description..."
                                            className="h-12 flex-1 min-w-[220px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 px-3 rounded-lg font-bold"
                                        />
                                        <div
                                            ref={dailyCategoryMenuRef}
                                            className="relative h-12 min-w-[140px] lg:flex-none"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setIsDailyCategoryOpen(
                                                        (prev) => !prev,
                                                    )
                                                }
                                                className="h-12 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-left font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                                            >
                                                <span>
                                                    {`${dailySelectedCategory.iconToken} ${dailySelectedCategory.name}`}
                                                </span>
                                                <ChevronDown
                                                    size={16}
                                                    className="text-slate-500"
                                                />
                                            </button>
                                            {isDailyCategoryOpen && (
                                                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                                    {categories.map(
                                                        (category) => (
                                                            <button
                                                                key={category.id}
                                                                type="button"
                                                            onClick={() => {
                                                                setDailyCategoryId(
                                                                    category.id,
                                                                );
                                                                setIsDailyCategoryOpen(
                                                                    false,
                                                                );
                                                            }}
                                                            className={cn(
                                                                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold transition-colors",
                                                                dailyCategoryId ===
                                                                    category.id
                                                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                                                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                                                            )}
                                                        >
                                                            {
                                                                category.iconToken
                                                            }
                                                            <span>
                                                                {category.name}
                                                            </span>
                                                        </button>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700 lg:w-auto lg:min-w-[390px] lg:flex-none">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                                                <div className="flex items-center gap-1 min-w-0">
                                                    <select
                                                        value={
                                                            dailyStartParts.hour
                                                        }
                                                        onChange={(e) =>
                                                            updateTimePart(
                                                                setDailyStartParts,
                                                                "hour",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                                                    >
                                                        {HOUR_OPTIONS.map(
                                                            (hour) => (
                                                                <option
                                                                    key={`start-hour-${hour}`}
                                                                    value={hour}
                                                                >
                                                                    {hour}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                    <span className="font-bold text-slate-500">
                                                        :
                                                    </span>
                                                    <select
                                                        value={
                                                            dailyStartParts.minute
                                                        }
                                                        onChange={(e) =>
                                                            updateTimePart(
                                                                setDailyStartParts,
                                                                "minute",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                                                    >
                                                        {MINUTE_OPTIONS.map(
                                                            (minute) => (
                                                                <option
                                                                    key={`start-minute-${minute}`}
                                                                    value={
                                                                        minute
                                                                    }
                                                                >
                                                                    {minute}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                    <select
                                                        value={
                                                            dailyStartParts.period
                                                        }
                                                        onChange={(e) =>
                                                            updateTimePart(
                                                                setDailyStartParts,
                                                                "period",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                                                    >
                                                        {PERIOD_OPTIONS.map(
                                                            (period) => (
                                                                <option
                                                                    key={`start-period-${period}`}
                                                                    value={
                                                                        period
                                                                    }
                                                                >
                                                                    {period}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </div>
                                                <span className="font-bold text-slate-500 text-center sm:px-1">
                                                    to
                                                </span>
                                                <div className="flex items-center gap-1 min-w-0">
                                                    <select
                                                        value={
                                                            dailyEndParts.hour
                                                        }
                                                        onChange={(e) =>
                                                            updateTimePart(
                                                                setDailyEndParts,
                                                                "hour",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                                                    >
                                                        {HOUR_OPTIONS.map(
                                                            (hour) => (
                                                                <option
                                                                    key={`end-hour-${hour}`}
                                                                    value={hour}
                                                                >
                                                                    {hour}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                    <span className="font-bold text-slate-500">
                                                        :
                                                    </span>
                                                    <select
                                                        value={
                                                            dailyEndParts.minute
                                                        }
                                                        onChange={(e) =>
                                                            updateTimePart(
                                                                setDailyEndParts,
                                                                "minute",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                                                    >
                                                        {MINUTE_OPTIONS.map(
                                                            (minute) => (
                                                                <option
                                                                    key={`end-minute-${minute}`}
                                                                    value={
                                                                        minute
                                                                    }
                                                                >
                                                                    {minute}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                    <select
                                                        value={
                                                            dailyEndParts.period
                                                        }
                                                        onChange={(e) =>
                                                            updateTimePart(
                                                                setDailyEndParts,
                                                                "period",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                                                    >
                                                        {PERIOD_OPTIONS.map(
                                                            (period) => (
                                                                <option
                                                                    key={`end-period-${period}`}
                                                                    value={
                                                                        period
                                                                    }
                                                                >
                                                                    {period}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        {dailyTimeError && (
                                            <p className="text-xs font-bold text-red-600 dark:text-red-400">
                                                {dailyTimeError}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            type="submit"
                                            disabled={!dailyTaskText.trim()}
                                            className={
                                                editingDailyTaskId
                                                    ? "bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                                                    : "bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                                            }
                                        >
                                            {editingDailyTaskId
                                                ? "Save"
                                                : "Add"}
                                        </button>
                                        {editingDailyTaskId && (
                                            <button
                                                type="button"
                                                onClick={cancelEditDailyTask}
                                                className="bg-slate-400 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-500 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </form>
                            {/* List of tasks for the selected day, sorted by time */}
                            <div>
                                {dayTasks.length === 0 ? (
                                    <div className="text-center text-slate-500 italic">
                                        No tasks for this day yet.
                                    </div>
                                ) : (
                                    <ul className="space-y-3">
                                        {dayTasks
                                            .sort((a, b) => {
                                                if (
                                                    !a.startTime ||
                                                    !b.startTime
                                                )
                                                    return 0;
                                                return (
                                                    timeToMinutes(a.startTime) -
                                                    timeToMinutes(b.startTime)
                                                );
                                            })
                                            .map((task) => {
                                                const category = getCategoryById(
                                                    normalizeTaskCategoryId(task),
                                                );
                                                const categoryStyle =
                                                    getCategoryColorStyle(
                                                        category.colorToken,
                                                    );
                                                if (
                                                    editingDailyTaskId ===
                                                    task.id
                                                ) {
                                                    // Edit mode handled by the form above
                                                    return null;
                                                }
                                                return (
                                                    <li
                                                        key={task.id}
                                                        className={cn(
                                                            "flex items-start gap-3 p-3 rounded-xl border-l-4 shadow-sm cursor-pointer transition-all min-w-0 max-w-full",
                                                            categoryStyle.colorClass,
                                                            categoryStyle.borderClass,
                                                            task.completed
                                                                ? "opacity-60"
                                                                : "hover:bg-slate-100 dark:hover:bg-slate-800",
                                                        )}
                                                        style={{
                                                            wordBreak: "normal",
                                                            overflowWrap:
                                                                "anywhere",
                                                        }}
                                                        onClick={() =>
                                                            toggleTask(task.id)
                                                        }
                                                        title="Click to mark as done/undone"
                                                    >
                                                        <span className="mt-0.5 shrink-0">
                                                            {task.completed ? (
                                                                <CheckCircle2
                                                                    size={18}
                                                                    className="text-emerald-500"
                                                                />
                                                            ) : (
                                                                <Circle
                                                                    size={18}
                                                                    className="text-slate-400"
                                                                />
                                                            )}
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 font-bold min-w-0">
                                                                        {
                                                                            category.iconToken
                                                                        }
                                                                        <span
                                                                            className={cn(
                                                                                "break-words whitespace-normal min-w-0",
                                                                                task.completed &&
                                                                                    "line-through",
                                                                            )}
                                                                        >
                                                                            {
                                                                                task.text
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                        <span
                                                                            className={cn(
                                                                                "font-mono text-xs text-slate-500",
                                                                                task.completed &&
                                                                                    "line-through",
                                                                            )}
                                                                        >
                                                                            {
                                                                                task.startTime
                                                                            }{" "}
                                                                            -{" "}
                                                                            {
                                                                                task.endTime
                                                                            }
                                                                        </span>
                                                                        <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                                            {category.name}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    <button
                                                                        onClick={(
                                                                            e,
                                                                        ) => {
                                                                            e.stopPropagation();
                                                                            startEditDailyTask(
                                                                                task,
                                                                            );
                                                                        }}
                                                                        className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg px-2 py-1.5 text-sm font-bold transition-all"
                                                                        title="Edit task"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={(
                                                                            e,
                                                                        ) => {
                                                                            e.stopPropagation();
                                                                            deleteTask(
                                                                                task.id,
                                                                            );
                                                                        }}
                                                                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg p-2 transition-all"
                                                                        title="Delete task"
                                                                    >
                                                                        <X
                                                                            size={
                                                                                18
                                                                            }
                                                                        />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {pendingImportBundle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Import Tasks
                        </h3>
                        {importStep === "select_mode" ? (
                            <>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                    Found {pendingImportBundle.tasks.length} task
                                    {pendingImportBundle.tasks.length === 1 ? "" : "s"} in this
                                    backup. Choose import mode and review impact before confirming.
                                </p>
                                <div className="mt-4 space-y-3">
                                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Import mode
                                    </label>
                                    <select
                                        value={importSelectedMode}
                                        onChange={(e) =>
                                            setImportSelectedMode(
                                                e.target.value as ImportMode,
                                            )
                                        }
                                        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        <option value="merge_current_profile">
                                            Merge into current profile
                                        </option>
                                        <option value="replace_current_profile">
                                            Replace current profile
                                        </option>
                                        <option value="create_new_profile">
                                            Create new profile from import
                                        </option>
                                        <option value="replace_everything">
                                            Replace everything (full restore)
                                        </option>
                                    </select>

                                    {importSelectedMode === "create_new_profile" && (
                                        <>
                                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                                                New profile name
                                            </label>
                                            <input
                                                type="text"
                                                value={importCreateProfileName}
                                                onChange={(e) =>
                                                    setImportCreateProfileName(
                                                        e.target.value,
                                                    )
                                                }
                                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                placeholder={IMPORT_DEFAULT_PROFILE_BASE_NAME}
                                            />
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                    Impact preview (required before confirm):
                                </p>
                                {importPreviewResult?.impact && (
                                    <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                                        <li>
                                            • {importPreviewResult.impact.tasksToImport} task
                                            {importPreviewResult.impact.tasksToImport === 1
                                                ? ""
                                                : "s"}{" "}
                                            detected
                                        </li>
                                        <li>
                                            • {importPreviewResult.impact.tasksAdded} task
                                            {importPreviewResult.impact.tasksAdded === 1
                                                ? ""
                                                : "s"}{" "}
                                            to add
                                        </li>
                                        <li>
                                            • {importPreviewResult.impact.tasksRemoved} task
                                            {importPreviewResult.impact.tasksRemoved === 1
                                                ? ""
                                                : "s"}{" "}
                                            to remove
                                        </li>
                                        <li>
                                            • {importPreviewResult.impact.profilesAdded} profile
                                            {importPreviewResult.impact.profilesAdded === 1
                                                ? ""
                                                : "s"}{" "}
                                            to add
                                        </li>
                                        <li>
                                            • {importPreviewResult.impact.categoriesAdded} categor
                                            {importPreviewResult.impact.categoriesAdded === 1
                                                ? "y"
                                                : "ies"}{" "}
                                            to add
                                        </li>
                                        {importPreviewResult.impact.notes.map((note) => (
                                            <li key={note}>• {note}</li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}

                        {importModalError && (
                            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                                {importModalError}
                            </p>
                        )}

        {importModalWarning && (
                            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                                {importModalWarning}
                            </p>
                        )}

                        {importPreviewResult?.warnings &&
                            importPreviewResult.warnings.length > 1 && (
                                <ul className="mt-2 space-y-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                                    {importPreviewResult.warnings
                                        .slice(1)
                                        .map((warning) => (
                                            <li key={warning}>• {warning}</li>
                                        ))}
                                </ul>
                            )}

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={clearImportState}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            {importStep === "preview" ? (
                                <>
                                    <button
                                        onClick={() => setImportStep("select_mode")}
                                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={executeImportMode}
                                        className={cn(
                                            "rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors",
                                            importSelectedMode ===
                                                "replace_everything" ||
                                                importSelectedMode ===
                                                    "replace_current_profile"
                                                ? "bg-red-600 hover:bg-red-700"
                                                : "bg-blue-600 hover:bg-blue-700",
                                        )}
                                    >
                                        Confirm import
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={prepareImportPreview}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                                >
                                    Review impact
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showDeleteOptions && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Delete Tasks
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            This action cannot be undone. Choose what to delete
                            from{" "}
                            {deleteScope === "simple"
                                ? "Simple Tasks"
                                : `Weekly Schedule (${activeProfile?.name ?? "Default"})`}
                            .
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={closeDeleteOptions}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={deleteCompletedFromModal}
                                disabled={deleteScopeStats.completed === 0}
                                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Delete selected done (
                                {deleteScopeStats.completed})
                            </button>
                            <button
                                onClick={deleteAllFromModal}
                                disabled={deleteScopeStats.total === 0}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Delete all tasks ({deleteScopeStats.total})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showProfileDeleteConfirm && profileDeleteTargetId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Delete Profile
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            Delete profile "
                            {profiles.find(
                                (profile) =>
                                    profile.id === profileDeleteTargetId,
                            )?.name ?? "Selected"}
                            " and all its weekly tasks? This cannot be undone.
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowProfileDeleteConfirm(false);
                                    setProfileDeleteTargetId(null);
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteProfile}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
                            >
                                Delete profile
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showProfileLimitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Cannot Delete Profile
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            At least one profile must remain.
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => setShowProfileLimitModal(false)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                            >
                                Okay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCategoryManager && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-3xl rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                Manage Categories
                            </h3>
                            <button
                                onClick={() => {
                                    setShowCategoryManager(false);
                                    setEditingCategoryId(null);
                                    setEditingCategoryName("");
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                Add category
                            </p>
                            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) =>
                                        setNewCategoryName(e.target.value)
                                    }
                                    placeholder="Category name"
                                    className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                                <select
                                    value={newCategoryColorToken}
                                    onChange={(e) =>
                                        setNewCategoryColorToken(
                                            normalizeCategoryColorToken(
                                                e.target.value,
                                            ),
                                        )
                                    }
                                    className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    {CATEGORY_COLOR_OPTIONS.map((color) => (
                                        <option key={color} value={color}>
                                            {color}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={newCategoryIconToken}
                                    onChange={(e) =>
                                        setNewCategoryIconToken(
                                            normalizeCategoryIconToken(
                                                e.target.value,
                                            ),
                                        )
                                    }
                                    className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    {CATEGORY_ICON_OPTIONS.map((icon) => (
                                        <option key={icon} value={icon}>
                                            {icon}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={createCategory}
                                    className="h-10 rounded-lg bg-purple-600 px-4 text-xs font-bold text-white transition-colors hover:bg-purple-700"
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                                {categories.map((category) => {
                                    const style = getCategoryColorStyle(
                                        category.colorToken,
                                    );
                                    const isEditing =
                                        editingCategoryId === category.id;

                                    if (isEditing) {
                                        return (
                                            <li
                                                key={category.id}
                                                className="p-3"
                                            >
                                                <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center">
                                                    <input
                                                        type="text"
                                                        value={editingCategoryName}
                                                        onChange={(e) =>
                                                            setEditingCategoryName(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                    />
                                                    <select
                                                        value={
                                                            editingCategoryColorToken
                                                        }
                                                        onChange={(e) =>
                                                            setEditingCategoryColorToken(
                                                                normalizeCategoryColorToken(
                                                                    e.target
                                                                        .value,
                                                                ),
                                                            )
                                                        }
                                                        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                    >
                                                        {CATEGORY_COLOR_OPTIONS.map(
                                                            (color) => (
                                                                <option
                                                                    key={
                                                                        color
                                                                    }
                                                                    value={
                                                                        color
                                                                    }
                                                                >
                                                                    {color}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                    <select
                                                        value={
                                                            editingCategoryIconToken
                                                        }
                                                        onChange={(e) =>
                                                            setEditingCategoryIconToken(
                                                                normalizeCategoryIconToken(
                                                                    e.target
                                                                        .value,
                                                                ),
                                                            )
                                                        }
                                                        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                    >
                                                        {CATEGORY_ICON_OPTIONS.map(
                                                            (icon) => (
                                                                <option
                                                                    key={icon}
                                                                    value={icon}
                                                                >
                                                                    {icon}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={saveEditedCategory}
                                                        className="h-9 rounded-lg bg-green-600 px-3 text-xs font-bold text-white hover:bg-green-700"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditingCategoryId(
                                                                null,
                                                            )
                                                        }
                                                        className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    }

                                    return (
                                        <li
                                            key={category.id}
                                            className="flex items-center justify-between gap-3 p-3"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span
                                                    className={cn(
                                                        "rounded-full border px-2 py-0.5 text-xs font-bold",
                                                        style.colorClass,
                                                        style.borderClass,
                                                    )}
                                                >
                                                    {category.iconToken} {category.name}
                                                </span>
                                                {category.isBuiltIn && (
                                                    <span className="text-[10px] font-bold uppercase text-slate-500">
                                                        Built-in
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        startEditCategory(
                                                            category,
                                                        )
                                                    }
                                                    disabled={
                                                        category.isBuiltIn
                                                    }
                                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        requestDeleteCategory(
                                                            category.id,
                                                        )
                                                    }
                                                    disabled={
                                                        category.isBuiltIn
                                                    }
                                                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {showCategoryDeleteConfirm && categoryDeleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Delete Category
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            Delete "{categoryDeleteTarget.name}" and reassign {" "}
                            {categoryDeleteAffectedTasks} task
                            {categoryDeleteAffectedTasks === 1 ? "" : "s"}? This
                            action cannot be undone.
                        </p>

                        <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            Reassign to
                        </label>
                        <select
                            value={categoryDeleteReassignId}
                            onChange={(e) =>
                                setCategoryDeleteReassignId(e.target.value)
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                            {availableCategoryReassignOptions.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                        </select>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={cancelDeleteCategory}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteCategory}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
                            >
                                Delete Category
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {confirmDialog.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            {confirmDialog.message}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => setConfirmDialog(null)}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {confirmDialog.cancelLabel}
                            </button>
                            <button
                                onClick={executeConfirmDialog}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors",
                                    confirmDialog.tone === "danger"
                                        ? "bg-red-600 hover:bg-red-700"
                                        : "bg-blue-600 hover:bg-blue-700",
                                )}
                            >
                                {confirmDialog.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {profileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {profileModal.title}
                        </h3>
                        <div className="mt-3">
                            <input
                                type="text"
                                value={profileModalInput}
                                onChange={(e) =>
                                    setProfileModalInput(e.target.value)
                                }
                                placeholder="Profile name"
                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                        </div>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => {
                                    setProfileModal(null);
                                    setProfileModalInput("");
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitProfileModal}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                            >
                                {profileModal.submitLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {infoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {infoModal.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            {infoModal.message}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => setInfoModal(null)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
                            >
                                Okay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Version Footer */}
            <footer className="py-4 text-center text-xs font-bold text-slate-400 dark:text-slate-600">
                {isDark ? "Dark Mode" : "Light Mode"}
            </footer>
        </div>
    );
}
export default App;
