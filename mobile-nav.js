(function() {
    function toggleMobileMenu() {
        const menu = document.getElementById('mobile-nav-menu');
        if (!menu) return;
        const isOpen = menu.classList.toggle('open');
        document.body.classList.toggle('mobile-sidebar-open', isOpen);
    }

    function closeMobileMenu() {
        const menu = document.getElementById('mobile-nav-menu');
        if (!menu) return;
        menu.classList.remove('open');
        document.body.classList.remove('mobile-sidebar-open');
    }

    function bindMobileNavHandlers() {
        const navLinks = document.querySelectorAll('.mobile-nav-menu a');
        navLinks.forEach(link => {
            link.addEventListener('click', closeMobileMenu);
        });

        const sidebarLinks = document.querySelectorAll('.sidebar-item');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    closeMobileMenu();
                }
            });
        });

        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.addEventListener('click', closeMobileMenu);
        }
    }

    document.addEventListener('DOMContentLoaded', bindMobileNavHandlers);

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            closeMobileMenu();
        }
    });

    window.toggleMobileMenu = toggleMobileMenu;
    window.closeMobileMenu = closeMobileMenu;
})();
