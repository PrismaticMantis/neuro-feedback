import type { User } from '../types';

export function getProfileUser(users: unknown, index: number): User {
  return (users as User[])[index];
}

export function ProfileUserList({
  users,
  currentUserId,
  onSelect,
}: {
  users: User[];
  currentUserId: string | null;
  onSelect: (userId: string) => void;
}) {
  return (
    <div className="user-list" style={{ marginTop: 16 }}>
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          className={currentUserId === user.id ? 'user-btn active' : 'user-btn'}
          onClick={() => onSelect(user.id)}
        >
          {user.name}
        </button>
      ))}
    </div>
  );
}
