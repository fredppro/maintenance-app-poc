CREATE TYPE "MaterialUnit" AS ENUM (
  'PC', 'BOX', 'SET', 'BAG', 'ROLL', 'TUBE', 'CAN', 'KIT', 'PAIR',
  'L', 'ML', 'GAL', 'DRUM',
  'G', 'KG', 'LB',
  'MM', 'M', 'IN', 'FT'
);

ALTER TABLE "Material" ADD COLUMN "unit" "MaterialUnit" NOT NULL DEFAULT 'PC';