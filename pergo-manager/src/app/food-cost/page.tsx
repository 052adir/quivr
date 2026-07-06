import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function FoodCostPage() {
  return (
    <ModulePlaceholder
      icon="receipt"
      title="ניתוח עלויות ופוד קוסט"
      intro="העלאת דוחות (רווח והפסד, מאזן בוחן, כרטסת ספקים, קניות חומרי גלם, דוחות מכירה) וניתוח אוטומטי לצמצום עלויות."
      points={[
        "אחוז חומרי גלם מהמחזור מול יעד (34%)",
        "זיהוי ספקים חריגים ועליות במחירי רכישה",
        "מנות עם פוד קוסט גבוה מדי",
        "פערים בין מכירות לקניות ובזבוז אפשרי",
        "המלצות התמקחות מול ספקים",
      ]}
    />
  );
}
