# Security Specification: Kairos — Act at the right moment, every time

## 1. Data Invariants
- **Task Integrity**: A task must have a non-empty title, a valid deadline string, a priority ('low', 'medium', 'high'), an associated owner `userId`, and a `completed` state.
- **Identity Matching**: Users can only create, update, delete, or list tasks, goals, or schedules if the record's `userId` matches the authenticated user (`request.auth.uid`).
- **State Protection**: Users are forbidden from modifying system-generated keys or modifying tasks belonging to other users.

## 2. The "Dirty Dozen" Malicious Payloads (Forbidden Actions)

### Payload 1: Task with spoofed owner
Attempting to create a task where `userId` is someone else's UID.
```json
{
  "title": "Hacked Task",
  "deadline": "2026-06-30T12:00:00Z",
  "priority": "high",
  "completed": false,
  "userId": "other_user_uid_123"
}
```

### Payload 2: Task with invalid priority value
Attempting to create a task with a spoofed priority field.
```json
{
  "title": "Bad Priority",
  "deadline": "2026-06-30T12:00:00Z",
  "priority": "ultra-critical",
  "completed": false,
  "userId": "my_uid_123"
}
```

### Payload 3: Shadow field injection
Injecting a ghost field `isAdminPrivilege` to exploit potential shadow update vulnerability.
```json
{
  "title": "Task with Shadow Field",
  "deadline": "2026-06-30T12:00:00Z",
  "priority": "medium",
  "completed": false,
  "userId": "my_uid_123",
  "isAdminPrivilege": true
}
```

### Payload 4: Spoofing system timestamp
Creating a task with client-provided custom `createdAt` representing past date.
```json
{
  "title": "Time Traveler",
  "deadline": "2026-06-30T12:00:00Z",
  "priority": "low",
  "completed": false,
  "userId": "my_uid_123",
  "createdAt": "2020-01-01T00:00:00Z"
}
```

### Payload 5: Updating task of another user
An authenticated user trying to overwrite a task document owned by another user.

### Payload 6: Goal with negative progress
Creating a weekly goal with negative progress or target.
```json
{
  "title": "Impossible Goal",
  "progress": -10,
  "target": 5,
  "userId": "my_uid_123"
}
```

### Payload 7: Schedule with empty task details
Creating a schedule for another user.

### Payload 8: Path parameter injection
Injecting special chars in the document ID to cause injection (e.g., `task%20ID`).

### Payload 9: Listing all tasks globally
Executing a list query without a `userId` filter to scrap other users' data.

### Payload 10: Modifying immutable createdAt field
Overwriting the `createdAt` timestamp of a task on update.

### Payload 11: Task with size limit exhaustion
Writing a massive title (e.g. 100KB) to exploit document size limits.

### Payload 12: Updating schedule of another user
Replacing the optimized battle plan of a target victim.
