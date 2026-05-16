import { z } from 'zod';

const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[!@#$%^&*]/, 'Must contain at least one special character (!@#$%^&*)');

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const signupSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: passwordSchema,
    displayName: z
        .string()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name must be at most 50 characters'),
    dateOfBirth: z
        .string()
        .min(1, 'Date of birth is required')
        .refine((val) => {
            const date = new Date(val);
            const now = new Date();
            const age = now.getFullYear() - date.getFullYear();
            const monthDiff = now.getMonth() - date.getMonth();
            const actualAge = monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate()) ? age - 1 : age;
            return actualAge >= 18;
        }, 'You must be at least 18 years old'),
    acceptLegal: z.boolean().refine((value) => value === true, 'You must accept the legal terms to continue'),
});

export const profileUpdateSchema = z.object({
    displayName: z
        .string()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name must be at most 50 characters'),
});

export const accountEmailUpdateSchema = z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const passwordResetRequestSchema = z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    locale: z.enum(['en', 'fr']).optional(),
});

export const accountPasswordUpdateSchema = z
    .object({
        password: passwordSchema,
        confirmPassword: z.string().min(1, 'Please confirm your new password'),
    })
    .refine((values) => values.password === values.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
export type AccountEmailUpdateFormData = z.infer<typeof accountEmailUpdateSchema>;
export type PasswordResetRequestFormData = z.infer<typeof passwordResetRequestSchema>;
export type AccountPasswordUpdateFormData = z.infer<typeof accountPasswordUpdateSchema>;
