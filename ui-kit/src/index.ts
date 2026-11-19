export { cn } from './lib/cn'
export {
  LayoutModeProvider,
  WIDE_BREAKPOINT,
  layoutModeForWidth,
  useLayoutMode,
} from './layout/layout-mode'
export type { LayoutMode } from './layout/layout-mode'
export { useViewportWidth } from './layout/use-viewport-width'
export { chatPaneVisibility, tasksPaneVisibility } from './layout/pane-visibility'
export type {
  ChatPaneVisibility,
  ChatPanelMode,
  TasksPaneVisibility,
} from './layout/pane-visibility'

export { Button, buttonVariants } from './primitives/Button'
export type { ButtonProps } from './primitives/Button'
export { Input } from './primitives/Input'
export type { InputProps } from './primitives/Input'
export { PasswordField } from './primitives/PasswordField'
export type { PasswordFieldProps } from './primitives/PasswordField'
export { Textarea } from './primitives/Textarea'
export type { TextareaProps } from './primitives/Textarea'
export { Switch } from './primitives/Switch'
export { InlineConfirm } from './primitives/InlineConfirm'
export type { InlineConfirmProps } from './primitives/InlineConfirm'
export { Badge } from './primitives/Badge'
export type { BadgeProps } from './primitives/Badge'
export { Skeleton } from './primitives/Skeleton'
export { SegmentedControl } from './primitives/SegmentedControl'
export type { SegmentOption, SegmentedControlProps } from './primitives/SegmentedControl'
export { Dialog, DialogClose, DialogContent, DialogTrigger } from './primitives/Dialog'
export type { DialogContentProps } from './primitives/Dialog'
export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger } from './primitives/Popover'
export { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './primitives/Menu'
export { Sheet, SheetClose, SheetContent, SheetTrigger } from './primitives/Sheet'
export type { SheetContentProps } from './primitives/Sheet'

export { TaskList } from './tasks/TaskList'
export type { TaskListProps } from './tasks/TaskList'
export { TaskRow, pluralizeAttachments } from './tasks/TaskRow'
export type { TaskRowProps } from './tasks/TaskRow'
export { TaskFilters, SEARCH_DEBOUNCE_MS } from './tasks/TaskFilters'
export type { TaskFiltersProps } from './tasks/TaskFilters'
export { StatusBadge } from './tasks/StatusBadge'
export { DeadlineLabel } from './tasks/DeadlineLabel'
export type { DeadlineLabelProps } from './tasks/DeadlineLabel'
export { TaskDetails } from './tasks/TaskDetails'
export type { TaskDetailsProps, TaskPatch } from './tasks/TaskDetails'
export { TaskFormFields, EMPTY_TASK_FORM, TITLE_MAX, DESCRIPTION_MAX } from './tasks/TaskFormFields'
export type { TaskFormErrors, TaskFormFieldsProps, TaskFormValue } from './tasks/TaskFormFields'
export { UserPicker, WATCHERS_LIMIT } from './tasks/UserPicker'
export type { UserPickerProps, UserSearchProps } from './tasks/UserPicker'
export { AttachmentList, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from './tasks/AttachmentList'
export type { AttachmentListProps, UploadOptions } from './tasks/AttachmentList'
export { TaskNotFound } from './tasks/TaskNotFound'
export { UserAvatar } from './tasks/UserAvatar'
export { TASK_VIEW_DEFAULT, TASK_VIEW_LABEL, selectedSegment, taskViewLayout } from './tasks/task-views'
export type { TaskView } from './tasks/task-views'
export {
  formatDay,
  formatDeadline,
  formatFullDateTime,
  formatRelativeDateTime,
  fromLocalInput,
  isOverdue,
  toLocalInput,
} from './tasks/deadline'
export { formatSize } from './tasks/format-size'
export { STATUS_LABEL, TASK_STATUSES, loginOf } from './tasks/types'
export type {
  TaskAttachment,
  TaskDetailsData,
  TaskItem,
  TaskSort,
  TaskStatus,
  TaskStatusFilter,
  TaskUser,
  UserSummary,
} from './tasks/types'

export { AppFrame } from './shell/AppFrame'
export type { AppFrameProps } from './shell/AppFrame'
export { NavRail } from './shell/NavRail'
export type { NavItem, NavProps } from './shell/NavRail'
export { TabBar } from './shell/TabBar'
export { PanelHeader, PanelHeaderButton } from './shell/PanelHeader'
export type { PanelHeaderProps, PanelHeaderButtonProps } from './shell/PanelHeader'
export { MobileTopBar } from './shell/MobileTopBar'
export type { MobileTopBarProps } from './shell/MobileTopBar'
export { ProfileButton } from './shell/ProfileButton'
export type { ProfileButtonProps } from './shell/ProfileButton'
export { ProfileMenu } from './shell/ProfileMenu'
export type { ProfileMenuProps, ProfileMenuExtraItem } from './shell/ProfileMenu'

export { formatBadgeCount } from './notifications/format-badge-count'
export { NotificationsButton } from './notifications/NotificationsButton'
export type { NotificationsButtonProps } from './notifications/NotificationsButton'
export { NotificationsList } from './notifications/NotificationsList'
export type { NotificationsListProps, NotificationsListState } from './notifications/NotificationsList'
export { NotificationItem } from './notifications/NotificationItem'
export type { NotificationItemProps, NotificationView } from './notifications/NotificationItem'
export { NotificationToast } from './notifications/NotificationToast'
export type { NotificationToastProps } from './notifications/NotificationToast'
export type { NotificationTone } from './notifications/tones'

export { AuthBrand } from './auth/AuthBrand'
export { LoginForm } from './auth/LoginForm'
export type { LoginFormProps } from './auth/LoginForm'
export { ChangePasswordDialog } from './auth/ChangePasswordDialog'
export type { ChangePasswordDialogProps } from './auth/ChangePasswordDialog'
export { ConnectionError } from './auth/ConnectionError'
export type { ConnectionErrorProps } from './auth/ConnectionError'
export { RestoringScreen } from './auth/RestoringScreen'

export { TelegramConnectPanel } from './telegram/TelegramConnectPanel'
export type { TelegramConnectPanelProps, TelegramConnectStatus } from './telegram/TelegramConnectPanel'
export { TelegramLinkedPanel } from './telegram/TelegramLinkedPanel'
export type { TelegramLinkedPanelProps } from './telegram/TelegramLinkedPanel'
export { TelegramUnlinkConfirm } from './telegram/TelegramUnlinkConfirm'
export type { TelegramUnlinkConfirmProps } from './telegram/TelegramUnlinkConfirm'
export { TelegramMenuItem } from './telegram/TelegramMenuItem'
export type { TelegramMenuItemProps } from './telegram/TelegramMenuItem'

export { ChatsLayout } from './chat/ChatsLayout'
export type { ChatsLayoutProps } from './chat/ChatsLayout'
export { ChatHeader } from './chat/ChatHeader'
export type { ChatHeaderProps } from './chat/ChatHeader'
export { Thread } from './chat/Thread'
export type { ThreadProps } from './chat/Thread'
export { AssistantMessage, SYSTEM_MESSAGE_LABEL } from './chat/AssistantMessage'
export { UserMessage } from './chat/UserMessage'
export { MarkdownText } from './chat/MarkdownText'
export { ToolGroup, ToolGroupParts, ToolCallRow, ToolFallback } from './chat/ToolGroup'
export { callStatus, formatArgs, groupSummary, pluralizeCalls, statusLabel } from './chat/tool-status'
export type { ToolCallStatus, ToolCallView } from './chat/tool-status'
export { RunningIndicator } from './chat/RunningIndicator'
export { RunNotice, CONFLICT_TEXT } from './chat/RunNotice'
export type { RunNoticeTone, RunNoticeKind } from './chat/RunNotice'
export { NextSteps } from './chat/NextSteps'
export { CARD_STEPS, OVERVIEW_STEPS, classifyAnswer, nextStepsFor } from './chat/next-steps'
export type { AnswerKind, NextStep } from './chat/next-steps'
export { Composer } from './chat/Composer'
export type { ComposerProps } from './chat/Composer'
export { ThreadWelcome, WELCOME_SUGGESTIONS } from './chat/ThreadWelcome'
export type { ThreadWelcomeProps, WelcomeSuggestion } from './chat/ThreadWelcome'
export { UserActionBar } from './chat/UserActionBar'
export type { UserActionBarProps } from './chat/UserActionBar'
export { EditComposer } from './chat/EditComposer'
export { ConnectionBanner } from './chat/ConnectionBanner'
export type { ConnectionBannerProps } from './chat/ConnectionBanner'
export { withReplaceFrom } from './chat/restart/with-replace-from'
export { useServerMessageIds, USER_MESSAGE_SAVED_EVENT } from './chat/restart/use-server-message-ids'
export type { ServerMessageIds, HistoryMessageRef } from './chat/restart/use-server-message-ids'
export { useServerReachability } from './chat/connection/use-server-reachability'
export type { Connection, ServerReachability } from './chat/connection/use-server-reachability'
export { isNetworkError } from './chat/connection/is-network-error'
export { NewMessageButton } from './chat/NewMessageButton'
export * from './chat/attachments'
export * from './chat/chat-list'
