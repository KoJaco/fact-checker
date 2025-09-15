import clsx from "clsx";
import type React from "react";

type ContainerProps<T extends React.ElementType> = {
    as?: T;
    className?: string;
    children: React.ReactNode;
};

export function Container<T extends React.ElementType = "div">({
    as,
    className,
    children,
}: Omit<React.ComponentPropsWithoutRef<T>, keyof ContainerProps<T>> &
    ContainerProps<T>) {
    const Component = as ?? "div";

    return (
        <Component
            className={clsx(
                "mx-auto max-w-2xl px-4 md:px-6 lg:px-8",
                className
            )}
        >
            <div className="mx-auto max-w-xl lg:max-w-none">{children}</div>
        </Component>
    );
}

export function ContainerDashboard<T extends React.ElementType = "div">({
    as,
    className,
    children,
}: Omit<React.ComponentPropsWithoutRef<T>, keyof ContainerProps<T>> &
    ContainerProps<T>) {
    const Component = as ?? "div";

    return (
        <Component className={clsx("max-w-5xl mx-auto", className)}>
            <div className="mx-auto lg:max-w-none px-6 sm:px-8 md:px-12">
                {children}
            </div>
        </Component>
    );
}
