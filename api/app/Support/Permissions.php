<?php

namespace App\Support;

/**
 * Deny-by-default role map. Every API operation checks one of these permissions on the
 * server; the Angular client receives the same list only to hide actions it cannot use.
 */
final class Permissions
{
    public const ROLES = ['owner', 'admin', 'project_manager', 'finance', 'staff', 'viewer'];

    private const MAP = [
        'owner' => ['*'],
        'admin' => [
            'workspace.settings', 'users.manage', 'audit.view', 'clients.view', 'clients.manage',
            'projects.view_all', 'projects.manage', 'tasks.manage', 'time.own', 'time.approve',
            'staff.view', 'staff.manage', 'rates.view', 'rates.manage', 'leave.approve',
            'finance.view', 'invoices.manage', 'payments.manage', 'payments.correct',
            'analytics.view', 'analytics.finance', 'reports.view', 'reports.finance', 'chat.use',
        ],
        'project_manager' => [
            'clients.view', 'projects.manage', 'tasks.manage', 'time.own', 'time.approve',
            'staff.view', 'leave.approve', 'analytics.view', 'reports.view', 'chat.use',
        ],
        'finance' => [
            'clients.view', 'clients.manage', 'projects.view_all', 'time.own', 'staff.view',
            'rates.view', 'rates.manage', 'finance.view', 'invoices.manage', 'payments.manage',
            'payments.correct', 'analytics.view', 'analytics.finance', 'reports.view',
            'reports.finance', 'chat.use', 'audit.view',
        ],
        'staff' => ['time.own', 'staff.view', 'chat.use', 'tasks.update_own'],
        'viewer' => ['clients.view', 'analytics.view'],
    ];

    public static function for(string $role): array
    {
        return self::MAP[$role] ?? [];
    }

    public static function allows(string $role, string $permission): bool
    {
        $granted = self::for($role);

        if (in_array('*', $granted, true)) {
            return $permission !== 'workspace.transfer' || $role === 'owner';
        }

        return in_array($permission, $granted, true);
    }

    /** Full expanded list for the client, so the UI can hide unavailable actions. */
    public static function expanded(string $role): array
    {
        if ($role === 'owner') {
            return self::allNamed();
        }

        return self::for($role);
    }

    public static function allNamed(): array
    {
        $all = [];
        foreach (self::MAP as $perms) {
            foreach ($perms as $p) {
                if ($p !== '*') {
                    $all[$p] = true;
                }
            }
        }
        $all['workspace.transfer'] = true;
        $all['time.approve_self'] = true; // owner only (granted through '*')

        return array_keys($all);
    }
}
