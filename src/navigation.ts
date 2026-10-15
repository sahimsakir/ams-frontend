export const pagePaths: Record<string,string> = {
 overview:'/overview', analytics:'/analytics', attendance:'/attendance', requests:'/requests', teams:'/teams', people:'/people', settings:'/settings', roles:'/roles', permissions:'/permissions', 'team-home':'/team-home-office', profile:'/profile',
};
export function pageFromLocation():string {
 const path=window.location.pathname.replace(/\/+$/,'')||'/';
 if(path==='/'&&window.location.hash==='#requests')return 'requests';
 if(path==='/')return 'overview';
 return Object.keys(pagePaths).find(page=>pagePaths[page]===path)||'not-found';
}
