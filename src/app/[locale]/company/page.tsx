import { redirect } from 'next/navigation';

export default function CompanyPage() {
    // Company page redirects to About for now as they serve similar purposes for the MVP
    return redirect('./about');
}
