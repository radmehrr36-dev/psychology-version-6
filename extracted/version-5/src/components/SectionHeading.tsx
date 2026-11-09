import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "../utils/cn";

interface Props {
  label: string;
  title: string;
  description?: string;
  linkLabel?: string;
  href?: string;
  className?: string;
}

export function SectionHeading({ label, title, description, linkLabel, href = "#top", className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={cn("text-right", className)}
    >
      <p className="section-label mb-3">{label}</p>
      <h2 className="section-title mb-4">{title}</h2>
      {description && <p className="section-lead mb-7">{description}</p>}
      {linkLabel && (
        <a
          href={href}
          className="group inline-flex min-h-11 items-center gap-2 text-sm font-bold text-steel transition-colors duration-300 hover:text-ink"
        >
          {linkLabel}
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-steel/10 transition-colors duration-300 group-hover:bg-steel group-hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" />
          </span>
        </a>
      )}
    </motion.div>
  );
}
